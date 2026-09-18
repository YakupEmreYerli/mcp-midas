/**
 * Emir araçları (place_order, update_order, cancel_order) varsayılan olarak kapalıdır.
 * Yalnız `MIDAS_ORDERS_ENABLED=1` açıkça verildiğinde MCP'ye kaydedilir; aksi hâlde
 * araç listesinde hiç görünmezler. Bu bayrak yalnız aracın var olup olmadığını belirler:
 * açıkken de her emir masaüstü onay penceresinden geçer, onayı atlatan bir anlamı yoktur.
 */
export const ORDERS_ENABLED_ENV = "MIDAS_ORDERS_ENABLED";

export function ordersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[ORDERS_ENABLED_ENV]?.trim() === "1";
}
