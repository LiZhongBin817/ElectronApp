import type { Component } from "solid-js";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  HopeProvider,
  NotificationsProvider,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from "@hope-ui/solid";

const App: Component = () => {
  const [appVersion, setAppVersion] = createSignal("加载中");
  const [updaterStatus, setUpdaterStatus] = createSignal<UpdaterStatus | null>(null);

  let removeUpdaterStatusListener: (() => void) | undefined;

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

  const shouldShowProgress = () => {
    const status = updaterStatus();

    return status?.status === "downloading" || status?.status === "downloaded";
  };

  const getStatusColor = () => {
    const status = updaterStatus();

    if (status?.status === "error") {
      return "#dc2626";
    }

    if (status?.status === "downloaded") {
      return "#047857";
    }

    return "#475569";
  };

  onMount(async () => {
    removeUpdaterStatusListener = window.$api.onUpdaterStatus((status) => {
      setUpdaterStatus(status);
    });

    try {
      const version = await window.$api.getAppVersion();
      setAppVersion(version);
    } catch (error) {
      console.error("获取应用版本失败", error);
      setAppVersion("未知");
    }
  });

  onCleanup(() => {
    removeUpdaterStatusListener?.();
  });

  return (
    <HopeProvider config={{ initialColorMode: "light" }}>
      <NotificationsProvider>
        <main style={{ padding: "16px" }}>
          <header
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              "flex-wrap": "wrap",
              gap: "12px",
              "margin-bottom": "16px",
              "border-bottom": "1px solid #e5e7eb",
              "padding-bottom": "12px",
            }}
          >
            <h1 style={{ margin: 0, "font-size": "18px", "font-weight": 600 }}>
              ElectronApp
            </h1>
            <div
              style={{
                display: "flex",
                "flex-direction": "column",
                "align-items": "flex-end",
                gap: "6px",
                color: getStatusColor(),
                "font-size": "14px",
                "line-height": 1.5,
                "min-width": "220px",
                "max-width": "100%",
              }}
            >
              <span>当前版本：{appVersion()}</span>
              <Show when={updaterStatus()}>
                <div
                  style={{
                    display: "flex",
                    "flex-direction": "column",
                    "align-items": "flex-end",
                    gap: "4px",
                    width: "min(260px, 100%)",
                  }}
                >
                  <span>{getUpdaterStatusText()}</span>
                  <Show when={shouldShowProgress()}>
                    <div
                      style={{
                        width: "100%",
                        height: "6px",
                        overflow: "hidden",
                        "border-radius": "999px",
                        background: "#e5e7eb",
                      }}
                    >
                      <div
                        style={{
                          width: `${getProgressPercent()}%`,
                          height: "100%",
                          "border-radius": "999px",
                          background:
                            updaterStatus()?.status === "downloaded"
                              ? "#10b981"
                              : "#0284c7",
                          transition: "width 180ms ease",
                        }}
                      />
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
          </header>

          <Tabs>
            <TabList>
              <Tab>标签1</Tab>
              <Tab>标签2</Tab>
            </TabList>
            <TabPanel>
              <p>面板1内容</p>
            </TabPanel>
            <TabPanel>
              <p>面板2内容</p>
            </TabPanel>
          </Tabs>
        </main>
      </NotificationsProvider>
    </HopeProvider>
  );
};

export default App;
