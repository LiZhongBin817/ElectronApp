import type { Component } from "solid-js";
import {
    Button,
    HopeProvider,
    NotificationsProvider,
    Tab,
    TabList,
    TabPanel,
    Tabs,
} from '@hope-ui/solid';

const App: Component = () => {
    return (
        <HopeProvider config={{ initialColorMode: "light" }}>
            <NotificationsProvider>
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
            </NotificationsProvider>
        </HopeProvider>
    )
}
export default App;