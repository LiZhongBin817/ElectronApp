import type { Component } from "solid-js";
import { createSignal, onMount } from "solid-js";
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

  onMount(async () => {
    try {
      const version = await window.$api.getAppVersion();
      setAppVersion(version);
    } catch (error) {
      console.error("获取应用版本失败", error);
      setAppVersion("未知");
    }
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
                color: "#475569",
                "font-size": "14px",
                "line-height": 1.5,
              }}
            >
              当前版本：{appVersion()}
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
