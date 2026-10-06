import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const [app, platform = "android"] = process.argv.slice(2);
if (!["elder", "family"].includes(app) || !["android", "ios"].includes(platform)) {
  throw new Error("Usage: npm run cap:elder -- [android|ios] or npm run cap:family -- [android|ios]");
}
if (!existsSync("dist/client/index.html")) {
  throw new Error("Build the web application first: npm run build. Native packaging needs dist/client/index.html.");
}
const env = { ...process.env, GRANNYTOOLS_APP: app };
function cap(...args) {
  const result = spawnSync("npx", ["cap", ...args], { env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const nativeRoot = `native/${app}/${platform}`;
if (!existsSync(nativeRoot)) cap("add", platform);
cap("sync", platform);

if (app === "elder" && platform === "android") {
  const base = `${nativeRoot}/app/src/main`;
  const source = "native/elder/widget/android";
  const files = {
    "HomeWidgetPlugin.java": "java/com/grannytools/app/HomeWidgetPlugin.java",
    "GrannytoolsWidget.java": "java/com/grannytools/app/GrannytoolsWidget.java",
    "grannytools_widget.xml": "res/layout/grannytools_widget.xml",
    "grannytools_widget_info.xml": "res/xml/grannytools_widget_info.xml",
    "grannytools_widget_strings.xml": "res/values/grannytools_widget_strings.xml",
  };
  for (const [input, output] of Object.entries(files)) {
    const dest = resolve(base, output);
    mkdirSync(resolve(dest, ".."), { recursive: true });
    copyFileSync(`${source}/${input}`, dest);
  }
  mkdirSync(`${base}/res/drawable`, { recursive: true });
  copyFileSync("public/icon-512.png", `${base}/res/drawable/grannytools_widget_icon.png`);
  const manifestPath = `${base}/AndroidManifest.xml`;
  let manifest = readFileSync(manifestPath, "utf8");
  if (!manifest.includes(".GrannytoolsWidget")) {
    manifest = manifest.replace("</application>", `
        <receiver android:name=".GrannytoolsWidget" android:exported="false" android:label="Grannytools">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/grannytools_widget_info" />
        </receiver>
    </application>`);
    writeFileSync(manifestPath, manifest);
  }
  const activityPath = `${base}/java/com/grannytools/app/MainActivity.java`;
  let activity = readFileSync(activityPath, "utf8");
  if (!activity.includes("registerPlugin(HomeWidgetPlugin.class)")) {
    if (activity.includes("super.onCreate(")) {
      activity = activity.replace(/super\.onCreate\([^;]+;/, "registerPlugin(HomeWidgetPlugin.class);\n        $&");
    } else {
      activity = activity.replace(/extends BridgeActivity\s*\{/, `extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(HomeWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }`);
    }
    writeFileSync(activityPath, activity);
  }
}
console.log(`Prepared ${app}/${platform}. Follow docs/CAPACITOR.md for signing, iOS widget extension and release checks.`);