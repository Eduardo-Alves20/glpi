export function canNotify() {
  return "Notification" in window;
}

export async function requestNotifyPermission() {
  if (!canNotify()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

let lastBeepAt = 0;
export function beepCooldown(ms = 8000) {
  const now = Date.now();
  if (now - lastBeepAt < ms) return false;
  lastBeepAt = now;
  return true;
}

export function playBeep() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = 880;
  g.gain.value = 0.05;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  setTimeout(() => {
    o.stop();
    ctx.close();
  }, 140);
}

export function notify(title, body) {
  if (!canNotify()) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}