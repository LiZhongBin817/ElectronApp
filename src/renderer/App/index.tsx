import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { HopeProvider, NotificationsProvider } from "@hope-ui/solid";

const emptyServiceForm = (): LocalServiceConfig => ({
  id: "",
  name: "",
  type: "nacos",
  cwd: "",
  startCommand: "",
  stopCommand: "",
  port: 8848,
  healthCheckUrl: "",
  registryConfig: {
    host: "127.0.0.1",
    port: 8848,
    namespaceId: "",
    groupName: "",
    clusterName: "",
    rootPath: "/services",
    redisCliPath: "",
    zookeeperCliPath: "",
  },
});

const serviceTypeOptions: Array<{ label: string; value: LocalServiceType }> = [
  { label: "Nacos", value: "nacos" },
  { label: "Zookeeper", value: "zookeeper" },
  { label: "Redis", value: "redis" },
];

const typeDefaultPort: Record<LocalServiceType, number> = {
  nacos: 8848,
  zookeeper: 2181,
  redis: 6379,
};

const getNewId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const unwrapResponse = <TData,>(response: IpcResponse<TData>, fallbackMessage: string) => {
  if (!response.success || response.data === undefined) {
    throw new Error(response.message || fallbackMessage);
  }

  return response.data;
};

const getStatusColor = (status?: LocalServiceStatus) => {
  if (!status?.running) {
    return "#64748b";
  }

  return status.healthy ? "#047857" : "#b45309";
};

const getStatusBackground = (status?: LocalServiceStatus) => {
  if (!status?.running) {
    return "#f1f5f9";
  }

  return status.healthy ? "#dcfce7" : "#fef3c7";
};

const getStatusText = (status?: LocalServiceStatus) => {
  if (!status) {
    return "未检测";
  }

  if (!status.running) {
    return "未运行";
  }

  if (!status.portOpen) {
    return "启动中";
  }

  return status.healthy ? "运行中" : "健康异常";
};

const formatBytes = (bytes?: number) => {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  // 下载进度里的字节数来自 updater，按 1024 进位展示成更容易读的大小。
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
};

const formatDownloadSpeed = (bytesPerSecond?: number) => {
  const formattedSize = formatBytes(bytesPerSecond);

  return formattedSize ? `${formattedSize}/s` : "";
};

const App: Component = () => {
  const [appVersion, setAppVersion] = createSignal("加载中");
  const [updaterStatus, setUpdaterStatus] = createSignal<UpdaterStatus | null>(null);
  const [services, setServices] = createSignal<LocalServiceConfig[]>([]);
  const [statuses, setStatuses] = createSignal<Record<string, LocalServiceStatus>>({});
  const [selectedServiceId, setSelectedServiceId] = createSignal("");
  const [registryResult, setRegistryResult] = createSignal<RegistryResult | null>(null);
  const [registryKeyword, setRegistryKeyword] = createSignal("");
  const [showRegistryDebug, setShowRegistryDebug] = createSignal(false);
  const [form, setForm] = createSignal<LocalServiceConfig>(emptyServiceForm());
  const [loadingText, setLoadingText] = createSignal("");
  const [message, setMessage] = createSignal("");

  let removeUpdaterStatusListener: (() => void) | undefined;
  let refreshTimer: number | undefined;
  let updaterStatusTimer: number | undefined;

  const selectedService = createMemo(() =>
    services().find((service) => service.id === selectedServiceId()),
  );

  const selectedStatus = createMemo(() => {
    const service = selectedService();
    return service ? statuses()[service.id] : undefined;
  });

  const filteredRegistryItems = createMemo(() => {
    const keyword = registryKeyword().trim().toLowerCase();
    const items = registryResult()?.items ?? [];

    if (!keyword) {
      return items;
    }

    // 注册节点通常是完整包名，支持按服务名、路径、分组和命名空间快速过滤。
    return items.filter((item) =>
      [item.name, item.path, item.group, item.namespace]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(keyword)),
    );
  });

  const isBusy = createMemo(() => Boolean(loadingText()));
  const isEditing = createMemo(() => Boolean(form().id));
  const noticeText = createMemo(() => loadingText() || message());
  const isEditLockMessage = createMemo(() => message() === "请先取消编辑或保存配置后再切换服务");
  const isWarningNotice = createMemo(() =>
    isEditLockMessage() || /失败|错误|异常|无法|权限|仍在监听|取消重启/.test(noticeText()),
  );

  const resetRegistryView = () => {
    // 选中服务变化后清空旧注册信息，避免把上一个服务的节点误认为当前服务数据。
    setRegistryResult(null);
    setRegistryKeyword("");
    setShowRegistryDebug(false);
  };

  const getProgressPercent = () => {
    const percent = updaterStatus()?.percent ?? 0;

    return Math.min(100, Math.max(0, percent));
  };

  const getUpdaterStatusText = () => {
    const status = updaterStatus();

    if (!status) {
      return "";
    }

    if (status.status === "downloading") {
      return `正在下载更新：${getProgressPercent().toFixed(2)}%`;
    }

    return status.message;
  };

  const getUpdaterProgressDetail = () => {
    const status = updaterStatus();

    if (!status || status.status !== "downloading") {
      return "";
    }

    const transferred = formatBytes(status.transferred);
    const total = formatBytes(status.total);
    const speed = formatDownloadSpeed(status.bytesPerSecond);
    const details = [
      transferred && total ? `${transferred} / ${total}` : "",
      speed,
    ].filter(Boolean);

    return details.join(" · ");
  };

  const syncUpdaterStatus = async () => {
    try {
      const status = await window.$api.getUpdaterStatus();

      // updater 事件可能早于页面监听注册，主动拉取最后状态作为兜底。
      if (status) {
        setUpdaterStatus(status);
      }
    } catch (error) {
      console.error("同步更新状态失败", error);
    }
  };

  const refreshStatuses = async () => {
    const response = await window.$api.getLocalServiceStatuses();
    const statusList = unwrapResponse(response, "获取服务状态失败");
    const nextStatuses = statusList.reduce<Record<string, LocalServiceStatus>>((result, status) => {
      result[status.id] = status;
      return result;
    }, {});

    setStatuses(nextStatuses);
    const selectedStatus = nextStatuses[selectedServiceId()];

    // 启动命令可能先返回，端口稍后才监听；自动刷新时把状态回填成成功提示。
    if (selectedStatus?.running && message().includes("启动")) {
      setMessage("服务启动成功");
    }

    return nextStatuses;
  };

  const loadServices = async () => {
    setLoadingText("加载服务配置中");

    try {
      const serviceList = unwrapResponse(await window.$api.listLocalServices(), "加载服务配置失败");
      setServices(serviceList);

      if (!selectedServiceId() && serviceList.length > 0) {
        setSelectedServiceId(serviceList[0].id);
      }

      await refreshStatuses();
      setMessage("服务配置已刷新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载服务配置失败");
    } finally {
      setLoadingText("");
    }
  };

  const updateRegistryConfig = <TKey extends keyof RegistryConfig>(
    key: TKey,
    value: RegistryConfig[TKey],
  ) => {
    setForm((currentForm) => ({
      ...currentForm,
      registryConfig: {
        ...currentForm.registryConfig,
        [key]: value,
      },
    }));
  };

  const handleTypeChange = (type: LocalServiceType) => {
    const port = typeDefaultPort[type];

    setForm((currentForm) => ({
      ...currentForm,
      type,
      port,
      registryConfig: {
        ...currentForm.registryConfig,
        port,
        rootPath: type === "zookeeper" ? currentForm.registryConfig?.rootPath || "/services" : "",
      },
    }));
  };

  const editService = (service: LocalServiceConfig) => {
    if (isEditing() && form().id !== service.id) {
      setMessage("请先取消编辑或保存配置后再切换服务");
      return;
    }

    setForm({
      ...emptyServiceForm(),
      ...service,
      registryConfig: {
        ...emptyServiceForm().registryConfig,
        ...service.registryConfig,
      },
    });
    setSelectedServiceId(service.id);
    resetRegistryView();
    setMessage("已载入配置，可直接修改后保存");
  };

  const selectService = (serviceId: string) => {
    if (isEditing() && form().id !== serviceId) {
      setMessage("请先取消编辑或保存配置后再切换服务");
      return;
    }

    setSelectedServiceId(serviceId);
    resetRegistryView();
  };

  const resetForm = () => {
    setForm(emptyServiceForm());
    setMessage("");
  };

  const saveService = async () => {
    const currentForm = form();

    if (!currentForm.name.trim()) {
      setMessage("请填写服务名称");
      return;
    }

    if (!currentForm.startCommand.trim()) {
      setMessage("请填写启动命令");
      return;
    }

    if (!Number.isInteger(currentForm.port) || currentForm.port <= 0 || currentForm.port > 65535) {
      setMessage("端口必须是 1-65535 的整数");
      return;
    }

    setLoadingText("保存配置中");

    try {
      // 保存前统一 trim，避免路径和命令两侧空格造成 spawn/exec 失败。
      const savedService = unwrapResponse(
        await window.$api.saveLocalService({
          ...currentForm,
          id: currentForm.id || getNewId(),
          name: currentForm.name.trim(),
          cwd: currentForm.cwd.trim(),
          startCommand: currentForm.startCommand.trim(),
          stopCommand: currentForm.stopCommand?.trim() || undefined,
          healthCheckUrl: currentForm.healthCheckUrl?.trim() || undefined,
          registryConfig: currentForm.registryConfig,
        }),
        "保存配置失败",
      );

      setSelectedServiceId(savedService.id);
      resetForm();
      await loadServices();
      setMessage("配置已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存配置失败");
    } finally {
      setLoadingText("");
    }
  };

  const removeService = async (serviceId: string) => {
    setLoadingText("删除配置中");

    try {
      const response = await window.$api.removeLocalService(serviceId);

      if (!response.success) {
        throw new Error(response.message || "删除配置失败");
      }

      setSelectedServiceId("");
      resetRegistryView();
      await loadServices();
      setMessage("配置已删除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除配置失败");
    } finally {
      setLoadingText("");
    }
  };

  const runServiceAction = async (
    serviceId: string,
    action: "start" | "stop" | "restart",
  ) => {
    const actionText = action === "start" ? "启动" : action === "stop" ? "停止" : "重启";
    setLoadingText(`${actionText}服务中`);

    try {
      const response =
        action === "start"
          ? await window.$api.startLocalService(serviceId)
          : action === "stop"
            ? await window.$api.stopLocalService(serviceId)
            : await window.$api.restartLocalService(serviceId);
      const result = unwrapResponse(response, `${actionText}服务失败`);

      const nextStatuses = await refreshStatuses();
      const nextStatus = nextStatuses[serviceId];

      if ((action === "start" || action === "restart") && nextStatus?.running) {
        setMessage("服务启动成功");
        return;
      }

      if (action === "start" || action === "restart") {
        // 慢启动服务额外延迟刷新两次，让 Zookeeper/Nacos 这类脚本启动更稳。
        window.setTimeout(() => {
          refreshStatuses()
            .then((delayedStatuses) => {
              if (delayedStatuses[serviceId]?.running) {
                setMessage("服务启动成功");
              }
            })
            .catch((error) => {
              console.error("延迟刷新服务状态失败", error);
            });
        }, 3000);
        window.setTimeout(() => {
          refreshStatuses()
            .then((delayedStatuses) => {
              if (delayedStatuses[serviceId]?.running) {
                setMessage("服务启动成功");
              }
            })
            .catch((error) => {
              console.error("延迟刷新服务状态失败", error);
            });
        }, 8000);
      }
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${actionText}服务失败`);
    } finally {
      setLoadingText("");
    }
  };

  const loadRegistry = async (serviceId: string) => {
    const currentStatus = statuses()[serviceId];

    // 注册中心读取依赖目标服务已监听端口，未运行时直接阻止无意义 CLI/API 调用。
    if (currentStatus && !currentStatus.running) {
      resetRegistryView();
      setMessage("服务未运行，无法读取注册信息，请先启动服务或检查端口配置");
      return;
    }

    setLoadingText("读取注册信息中");

    try {
      const result = unwrapResponse(
        await window.$api.getRegisteredServices(serviceId),
        "读取注册信息失败",
      );
      // 每次重新读取注册中心时重置搜索和调试面板，避免沿用上一次的过滤条件。
      setRegistryKeyword("");
      setShowRegistryDebug(false);
      setRegistryResult(result);
      setMessage(result.message);
    } catch (error) {
      setRegistryResult(null);
      setMessage(error instanceof Error ? error.message : "读取注册信息失败");
    } finally {
      setLoadingText("");
    }
  };

  onMount(async () => {
    removeUpdaterStatusListener = window.$api.onUpdaterStatus((status) => {
      setUpdaterStatus(status);
    });
    await syncUpdaterStatus();
    updaterStatusTimer = window.setInterval(() => {
      syncUpdaterStatus().catch((error) => {
        console.error("定时同步更新状态失败", error);
      });
    }, 1000);

    try {
      const version = await window.$api.getAppVersion();
      setAppVersion(version);
    } catch (error) {
      console.error("获取应用版本失败", error);
      setAppVersion("未知");
    }

    await loadServices();
    refreshTimer = window.setInterval(() => {
      refreshStatuses().catch((error) => {
        console.error("自动刷新服务状态失败", error);
      });
    }, 5000);
  });

  onCleanup(() => {
    removeUpdaterStatusListener?.();
    if (updaterStatusTimer) {
      window.clearInterval(updaterStatusTimer);
    }

    if (refreshTimer) {
      window.clearInterval(refreshTimer);
    }
  });

  return (
    <HopeProvider config={{ initialColorMode: "light" }}>
      <NotificationsProvider>
        <main
          style={{
            display: "grid",
            "grid-template-rows": "auto minmax(0, 1fr)",
            gap: "16px",
            width: "100vw",
            height: "100vh",
            padding: "16px",
            color: "#0f172a",
            "background-color": "#f8fafc",
            overflow: "hidden",
          }}
        >
          <header
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              "flex-wrap": "wrap",
              gap: "12px",
              "border-bottom": "1px solid #e2e8f0",
              "padding-bottom": "12px",
              "min-width": 0,
            }}
          >
            <h1 style={{ margin: 0, "font-size": "20px", "font-weight": 700 }}>
              本地服务管理
            </h1>
            <div
              style={{
                display: "flex",
                "flex-direction": "column",
                "align-items": "flex-end",
                gap: "4px",
                color: updaterStatus()?.status === "error" ? "#dc2626" : "#475569",
                "font-size": "13px",
                "line-height": 1.5,
                "min-width": "260px",
                "max-width": "420px",
              }}
            >
              <span>当前版本：{appVersion()}</span>
              <Show when={updaterStatus()}>
                <div style={updaterPanelStyle}>
                  <span>{getUpdaterStatusText()}</span>
                  <Show when={getUpdaterProgressDetail()}>
                    {(detail) => <span style={updaterDetailStyle}>{detail()}</span>}
                  </Show>
                  <Show when={updaterStatus()?.status === "downloading"}>
                    <div
                      role="progressbar"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={Math.round(getProgressPercent())}
                      style={updaterProgressTrackStyle}
                    >
                      <div
                        style={{
                          ...updaterProgressBarStyle,
                          width: `${getProgressPercent()}%`,
                        }}
                      />
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
          </header>

          <section
            style={{
              display: "grid",
              "grid-template-columns": "minmax(300px, 420px) minmax(0, 1fr)",
              gap: "16px",
              "align-items": "start",
              "min-height": 0,
              "min-width": 0,
              overflow: "hidden",
            }}
          >
            <aside
              style={{
                height: "100%",
                overflow: "hidden",
                padding: "14px",
                border: "1px solid #e2e8f0",
                "border-radius": "8px",
                background: "#ffffff",
              }}
            >
              <h2 style={{ margin: "0 0 12px", "font-size": "16px" }}>服务配置</h2>
              <div style={{ display: "grid", gap: "10px" }}>
                <label style={{ display: "grid", gap: "6px", "font-size": "13px" }}>
                  服务名称
                  <input
                    value={form().name}
                    onInput={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        name: event.currentTarget.value,
                      }))
                    }
                    placeholder="例如：本地 Nacos"
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: "6px", "font-size": "13px" }}>
                  服务类型
                  <select
                    value={form().type}
                    onChange={(event) => handleTypeChange(event.currentTarget.value as LocalServiceType)}
                    style={inputStyle}
                  >
                    <For each={serviceTypeOptions}>
                      {(option) => <option value={option.value}>{option.label}</option>}
                    </For>
                  </select>
                </label>

                <div
                  style={{
                    display: "grid",
                    "grid-template-columns": "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: "10px",
                  }}
                >
                  <label style={{ display: "grid", gap: "6px", "font-size": "13px" }}>
                    工作目录
                    <input
                      value={form().cwd}
                      onInput={(event) =>
                        setForm((currentForm) => ({
                          ...currentForm,
                          cwd: event.currentTarget.value,
                        }))
                      }
                      placeholder="例如：D:\\nacos\\bin"
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px", "font-size": "13px" }}>
                    端口
                    <input
                      type="number"
                      value={form().port}
                      onInput={(event) => {
                        const port = Number(event.currentTarget.value);
                        setForm((currentForm) => ({
                          ...currentForm,
                          port,
                          registryConfig: {
                            ...currentForm.registryConfig,
                            port,
                          },
                        }));
                      }}
                      style={inputStyle}
                    />
                  </label>
                </div>

                <label style={{ display: "grid", gap: "6px", "font-size": "13px" }}>
                  启动命令
                  <input
                    value={form().startCommand}
                    onInput={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        startCommand: event.currentTarget.value,
                      }))
                    }
                    placeholder="例如：startup.cmd -m standalone"
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: "6px", "font-size": "13px" }}>
                  停止命令
                  <input
                    value={form().stopCommand || ""}
                    onInput={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        stopCommand: event.currentTarget.value,
                      }))
                    }
                    placeholder="可选，例如：shutdown.cmd"
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: "6px", "font-size": "13px" }}>
                  HTTP 健康检查
                  <input
                    value={form().healthCheckUrl || ""}
                    onInput={(event) =>
                      setForm((currentForm) => ({
                        ...currentForm,
                        healthCheckUrl: event.currentTarget.value,
                      }))
                    }
                    placeholder="可选，例如：http://127.0.0.1:8848/nacos"
                    style={inputStyle}
                  />
                </label>

                <div
                  style={{
                    display: "grid",
                    "grid-template-columns": "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: "10px",
                  }}
                >
                  <label style={{ display: "grid", gap: "6px", "font-size": "13px" }}>
                    注册中心 Host
                    <input
                      value={form().registryConfig?.host || ""}
                      onInput={(event) => updateRegistryConfig("host", event.currentTarget.value)}
                      placeholder="127.0.0.1"
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px", "font-size": "13px" }}>
                    注册端口
                    <input
                      type="number"
                      value={form().registryConfig?.port || form().port}
                      onInput={(event) => updateRegistryConfig("port", Number(event.currentTarget.value))}
                      style={inputStyle}
                    />
                  </label>
                </div>

                <Show when={form().type === "nacos"}>
                  <div
                    style={{
                      display: "grid",
                      "grid-template-columns": "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <input
                      value={form().registryConfig?.username || ""}
                      onInput={(event) => updateRegistryConfig("username", event.currentTarget.value)}
                      placeholder="Nacos 用户名，可选"
                      style={inputStyle}
                    />
                    <input
                      type="password"
                      value={form().registryConfig?.password || ""}
                      onInput={(event) => updateRegistryConfig("password", event.currentTarget.value)}
                      placeholder="Nacos 密码，可选"
                      style={inputStyle}
                    />
                    <input
                      value={form().registryConfig?.namespaceId || ""}
                      onInput={(event) =>
                        updateRegistryConfig("namespaceId", event.currentTarget.value)
                      }
                      placeholder="namespaceId，可选"
                      style={inputStyle}
                    />
                    <input
                      value={form().registryConfig?.groupName || ""}
                      onInput={(event) => updateRegistryConfig("groupName", event.currentTarget.value)}
                      placeholder="groupName，可选"
                      style={inputStyle}
                    />
                  </div>
                </Show>

                <Show when={form().type === "zookeeper"}>
                  <div style={{ display: "grid", gap: "10px" }}>
                    <input
                      value={form().registryConfig?.rootPath || ""}
                      onInput={(event) => updateRegistryConfig("rootPath", event.currentTarget.value)}
                      placeholder="服务根路径，例如：/services 或 /dubbo"
                      style={inputStyle}
                    />
                    <input
                      value={form().registryConfig?.zookeeperCliPath || ""}
                      onInput={(event) =>
                        updateRegistryConfig("zookeeperCliPath", event.currentTarget.value)
                      }
                      placeholder="zkCli.cmd 路径，可留空使用环境变量"
                      style={inputStyle}
                    />
                  </div>
                </Show>

                <Show when={form().type === "redis"}>
                  <input
                    value={form().registryConfig?.redisCliPath || ""}
                    onInput={(event) => updateRegistryConfig("redisCliPath", event.currentTarget.value)}
                    placeholder="redis-cli 路径，可留空使用环境变量"
                    style={inputStyle}
                  />
                </Show>

                <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
                  <button disabled={isBusy()} onClick={saveService} style={primaryButtonStyle}>
                    保存配置
                  </button>
                  <button disabled={isBusy()} onClick={resetForm} style={buttonStyle}>
                    {isEditing() ? "取消编辑" : "新建"}
                  </button>
                  <button disabled={isBusy()} onClick={loadServices} style={buttonStyle}>
                    刷新
                  </button>
                </div>
              </div>
            </aside>

            <section style={{ display: "grid", gap: "16px", "min-width": 0, "min-height": 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "14px",
                  border: "1px solid #e2e8f0",
                  "border-radius": "8px",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "space-between",
                    gap: "10px",
                    "margin-bottom": "12px",
                  }}
                >
                  <h2 style={{ margin: 0, "font-size": "16px" }}>服务列表</h2>
                </div>

                <Show when={noticeText()}>
                  <div
                    role={isWarningNotice() ? "alert" : "status"}
                    title={noticeText()}
                    style={{
                      color: isWarningNotice() ? "#9a3412" : "#475569",
                      background: isWarningNotice() ? "#ffedd5" : "#f8fafc",
                      border: isWarningNotice() ? "1px solid #fdba74" : "1px solid #e2e8f0",
                      "border-radius": "6px",
                      padding: "8px 10px",
                      "margin-bottom": "12px",
                      "font-size": "13px",
                      "font-weight": isWarningNotice() ? 700 : 500,
                      "line-height": 1.5,
                      "max-height": "112px",
                      overflow: "auto",
                      "overflow-wrap": "anywhere",
                      "white-space": "pre-wrap",
                      "user-select": "text",
                    }}
                  >
                    {noticeText()}
                  </div>
                </Show>

                <Show
                  when={services().length > 0}
                  fallback={<p style={{ color: "#64748b", margin: 0 }}>暂无配置，请先添加服务。</p>}
                >
                  <div style={{ display: "grid", gap: "10px" }}>
                    <For each={services()}>
                      {(service) => {
                        const status = () => statuses()[service.id];
                        const isSelected = () => selectedServiceId() === service.id;

                        return (
                          <article
                            onClick={() => selectService(service.id)}
                            style={{
                              display: "grid",
                              "grid-template-columns": "repeat(auto-fit, minmax(180px, 1fr))",
                              gap: "10px",
                              padding: "12px",
                              border: isSelected()
                                ? "1px solid #2563eb"
                                : "1px solid #e2e8f0",
                              "border-radius": "8px",
                              background: isSelected() ? "#eff6ff" : "#ffffff",
                              cursor: "pointer",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gap: "6px",
                                "min-width": 0,
                                "word-break": "break-word",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  "align-items": "center",
                                  gap: "8px",
                                  "flex-wrap": "wrap",
                                }}
                              >
                                <strong style={{ "font-size": "15px" }}>{service.name}</strong>
                                <span
                                  style={{
                                    padding: "3px 8px",
                                    "border-radius": "999px",
                                    color: getStatusColor(status()),
                                    background: getStatusBackground(status()),
                                    "font-size": "12px",
                                    "font-weight": 700,
                                  }}
                                >
                                  {getStatusText(status())}
                                </span>
                              </div>
                              <span style={{ color: "#64748b", "font-size": "13px" }}>
                                {service.type} · 端口 {service.port}
                                {status()?.pid ? ` · PID ${status()?.pid}` : ""}
                              </span>
                              <span
                                style={{
                                  color: getStatusColor(status()),
                                  "font-size": "13px",
                                  "font-weight": 600,
                                }}
                              >
                                {status()?.managed ? "当前应用启动" : "端口探测"} ·{" "}
                                {status()?.message || "等待检测"}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                "grid-template-columns": "repeat(auto-fit, minmax(56px, max-content))",
                                "align-items": "center",
                                "justify-content": "end",
                                gap: "8px",
                              }}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                disabled={isBusy() || Boolean(status()?.running)}
                                onClick={() => runServiceAction(service.id, "start")}
                                style={buttonStyle}
                                title={status()?.running ? "服务已运行" : "启动服务"}
                              >
                                启动
                              </button>
                              <button
                                disabled={isBusy() || !status()?.running}
                                onClick={() => runServiceAction(service.id, "stop")}
                                style={buttonStyle}
                                title={!status()?.running ? "服务未运行" : "停止服务"}
                              >
                                停止
                              </button>
                              <button
                                disabled={isBusy()}
                                onClick={() => runServiceAction(service.id, "restart")}
                                style={buttonStyle}
                              >
                                重启
                              </button>
                              <button
                                disabled={isBusy() || !status()?.running}
                                onClick={() => loadRegistry(service.id)}
                                style={buttonStyle}
                                title={!status()?.running ? "服务未运行，无法读取注册信息" : "读取注册信息"}
                              >
                                注册列表
                              </button>
                              <button disabled={isBusy()} onClick={() => editService(service)} style={buttonStyle}>
                                编辑
                              </button>
                              <button
                                disabled={isBusy()}
                                onClick={() => removeService(service.id)}
                                style={dangerButtonStyle}
                              >
                                删除
                              </button>
                            </div>
                          </article>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>

              <div
                style={{
                  padding: "14px",
                  border: "1px solid #e2e8f0",
                  "border-radius": "8px",
                  background: "#ffffff",
                }}
              >
                <h2 style={{ margin: "0 0 12px", "font-size": "16px" }}>注册信息</h2>
                <Show
                  when={registryResult()}
                  fallback={
                    <p style={{ color: "#64748b", margin: 0 }}>
                      选择服务后点击“注册列表”查看 Nacos 服务、Zookeeper 节点或 Redis 信息。
                    </p>
                  }
                >
                  {(result) => (
                    <div style={{ display: "grid", gap: "10px" }}>
                      <div
                        style={{
                          display: "flex",
                          "align-items": "center",
                          "justify-content": "space-between",
                          gap: "10px",
                          "flex-wrap": "wrap",
                        }}
                      >
                        <div style={{ color: "#475569", "font-size": "13px" }}>
                          <strong style={{ color: "#0f172a" }}>{result().items.length}</strong>
                          <span> 个节点 · {result().message}</span>
                        </div>
                        <Show when={result().debugInfo}>
                          <button
                            type="button"
                            onClick={() => setShowRegistryDebug((visible) => !visible)}
                            style={buttonStyle}
                          >
                            {showRegistryDebug() ? "隐藏调试" : "查看调试"}
                          </button>
                        </Show>
                      </div>
                      <Show when={result().items.length > 0}>
                        <input
                          value={registryKeyword()}
                          onInput={(event) => setRegistryKeyword(event.currentTarget.value)}
                          placeholder="搜索服务名或路径"
                          style={inputStyle}
                        />
                      </Show>
                      <Show when={result().debugInfo && showRegistryDebug()}>
                        {(debugInfo) => (
                          <div style={infoPanelStyle}>
                            <strong>调试信息</strong>
                            <For each={Object.entries(debugInfo())}>
                              {([key, value]) => (
                                <span>
                                  {key}：{String(value ?? "-")}
                                </span>
                              )}
                            </For>
                          </div>
                        )}
                      </Show>
                      <Show when={result().redisInfo}>
                        {(redisInfo) => (
                          <div style={infoPanelStyle}>
                            <span>版本：{redisInfo().version || "-"}</span>
                            <span>模式：{redisInfo().mode || "-"}</span>
                            <span>连接数：{redisInfo().connectedClients || 0}</span>
                            <span>内存：{redisInfo().usedMemoryHuman || "-"}</span>
                            <span>Keyspace：{redisInfo().keyspace?.join("；") || "-"}</span>
                          </div>
                        )}
                      </Show>
                      <Show when={result().items.length > 0}>
                        <div style={registryListStyle}>
                          <For
                            each={filteredRegistryItems()}
                            fallback={
                              <p style={{ margin: 0, color: "#64748b", "font-size": "13px" }}>
                                未匹配到节点
                              </p>
                            }
                          >
                            {(item) => (
                              <article style={registryItemStyle}>
                                <strong title={item.name}>{item.name}</strong>
                                <Show when={item.path}>
                                  <span>路径：{item.path}</span>
                                </Show>
                                <Show when={item.group}>
                                  <span>分组：{item.group}</span>
                                </Show>
                                <Show when={item.namespace}>
                                  <span>命名空间：{item.namespace}</span>
                                </Show>
                                <Show when={(item.instances?.length || 0) > 0}>
                                  <span>
                                    实例：
                                    {item.instances
                                      ?.map((instance) =>
                                        `${instance.ip || "-"}:${instance.port || "-"} ${
                                          instance.healthy === false ? "异常" : "健康"
                                        }`,
                                      )
                                      .join("，")}
                                  </span>
                                </Show>
                              </article>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )}
                </Show>
              </div>

              <Show when={selectedService()}>
                <div style={{ color: "#64748b", "font-size": "13px" }}>
                  当前选择：{selectedService()?.name} · {getStatusText(selectedStatus())}
                </div>
              </Show>
            </section>
          </section>
        </main>
      </NotificationsProvider>
    </HopeProvider>
  );
};

const inputStyle: JSX.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  "border-radius": "6px",
  "font-size": "13px",
  outline: "none",
  "box-sizing": "border-box",
};

const buttonStyle: JSX.CSSProperties = {
  padding: "7px 10px",
  border: "1px solid #cbd5e1",
  "border-radius": "6px",
  background: "#ffffff",
  color: "#0f172a",
  cursor: "pointer",
  "font-size": "13px",
};

const primaryButtonStyle: JSX.CSSProperties = {
  ...buttonStyle,
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#ffffff",
};

const dangerButtonStyle: JSX.CSSProperties = {
  ...buttonStyle,
  border: "1px solid #fecaca",
  color: "#b91c1c",
};

const updaterPanelStyle: JSX.CSSProperties = {
  display: "grid",
  gap: "4px",
  width: "100%",
  "text-align": "right",
  "word-break": "break-word",
};

const updaterDetailStyle: JSX.CSSProperties = {
  color: "#64748b",
  "font-size": "12px",
};

const updaterProgressTrackStyle: JSX.CSSProperties = {
  width: "100%",
  height: "6px",
  overflow: "hidden",
  border: "1px solid #bfdbfe",
  "border-radius": "999px",
  background: "#eff6ff",
};

const updaterProgressBarStyle: JSX.CSSProperties = {
  height: "100%",
  "border-radius": "999px",
  background: "#2563eb",
  transition: "width 180ms ease",
};

const registryListStyle: JSX.CSSProperties = {
  display: "grid",
  gap: "6px",
  "max-height": "420px",
  overflow: "auto",
  padding: "2px",
};

const registryItemStyle: JSX.CSSProperties = {
  display: "grid",
  gap: "3px",
  padding: "8px 10px",
  border: "1px solid #e2e8f0",
  "border-radius": "6px",
  background: "#f8fafc",
  "font-size": "13px",
  color: "#334155",
  "line-height": 1.4,
  "word-break": "break-all",
};

const infoPanelStyle: JSX.CSSProperties = {
  display: "grid",
  gap: "4px",
  padding: "10px",
  border: "1px solid #e2e8f0",
  "border-radius": "8px",
  background: "#f8fafc",
  "font-size": "13px",
  color: "#334155",
};

export default App;
