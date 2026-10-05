/// <reference types="vite/client" />

declare module "echarts/lib/i18n/langPL.js" {
  const locale: Parameters<typeof import("echarts/core").registerLocale>[1];
  export default locale;
}
