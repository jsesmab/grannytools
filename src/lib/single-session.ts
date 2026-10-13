const KEY = "gt.deviceId";
export const LOGIN_FLAG = "gt.justLoggedIn";
export const KICKED_FLAG = "gt.kicked";

export function deviceId() {
  let id = localStorage.getItem(KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
  return id;
}
