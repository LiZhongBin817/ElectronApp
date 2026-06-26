import net from "node:net";

const DEFAULT_TIMEOUT = 1500;

export const checkPortOpen = (host: string, port: number, timeout = DEFAULT_TIMEOUT) =>
  new Promise<boolean>((resolve) => {
    // 端口探测是本地服务运行状态的基础判断，先校验端口范围避免 net 抛异常。
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      resolve(false);
      return;
    }

    const socket = net.createConnection({ host, port });
    let settled = false;

    // connect/timeout/error 可能竞争触发，settled 确保 Promise 只完成一次。
    const finish = (isOpen: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(isOpen);
    };

    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });

export const checkHttpHealth = async (url: string, timeout = DEFAULT_TIMEOUT) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    // HTTP 健康检查用于补充端口探测，只有 2xx/3xx 才视为 healthy。
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};
