import { Capacitor, registerPlugin } from "@capacitor/core";

type HomeWidgetPlugin = {
  isSupported(): Promise<{ supported: boolean }>;
  requestPin(): Promise<{ requested: boolean }>;
};

const HomeWidget = registerPlugin<HomeWidgetPlugin>("HomeWidget");

export type WidgetPlatform = "android" | "ios" | "web";

export function widgetPlatform(): WidgetPlatform {
  if (!Capacitor.isNativePlatform()) return "web";
  return Capacitor.getPlatform() === "android" ? "android" : "ios";
}

export async function requestHomeWidget(): Promise<"requested" | "unsupported" | "failed"> {
  if (widgetPlatform() !== "android") return "unsupported";
  try {
    if (!(await HomeWidget.isSupported()).supported) return "unsupported";
    return (await HomeWidget.requestPin()).requested ? "requested" : "unsupported";
  } catch {
    return "failed";
  }
}