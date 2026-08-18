"use client";

import { useEffect, useState, useCallback } from "react";

type License = {
  id: string;
  license_key: string;
  status: "active" | "expired" | "revoked" | "pending";
  user_name: string | null;
  expires_at: string | null;
  activated_at: string | null;
  max_devices: number;
  created_at: string;
  notes: string | null;
  device_count?: number;
};

type Notification = {
  id: string;
  title: string;
  body: string;
  type: string;
  is_active: boolean;
  created_at: string;
};

type Stats = {
  total: number;
  active: number;
  expired: number;
  revoked: number;
};

// ─── Format helpers ────────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return "Lifetime";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function isExpired(d: string | null) {
  if (!d) return false;
  return Date.now() >= new Date(d).getTime();
}

// ─── Status Badge ────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const cls =
    status === "active" ? "badge-active" :
    status === "expired" ? "badge-expired" :
    status === "revoked" ? "badge-revoked" : "badge-pending";
  return (
    <span className={`${cls} text-xs font-semibold px-2.5 py-0.5 rounded-full`}>
      {status.toUpperCase()}
    </span>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="glass rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-3xl font-bold text-white">{value}</p>
        <p className="text-sm text-gray-400">{label}</p>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, expired: 0, revoked: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"licenses" | "notifications" | "generate">("licenses");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Generate form state
  const [genForm, setGenForm] = useState({
    user_name: "",
    days: "30",
    lifetime: false,
    max_devices: "1",
    notes: "",
    count: "1",
  });

  // Notification form state
  const [notifForm, setNotifForm] = useState({ title: "", body: "", type: "info" });

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Load data ──────────────────────────────────────────────────────────
  const loadLicenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/licenses");
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const enriched: License[] = json.data || [];
      setLicenses(enriched);
      setStats({
        total: enriched.length,
        active: enriched.filter((l) => l.status === "active" && !isExpired(l.expires_at)).length,
        expired: enriched.filter((l) => l.status === "expired" || isExpired(l.expires_at)).length,
        revoked: enriched.filter((l) => l.status === "revoked").length,
      });
    } catch (err: any) {
      showToast("Error loading licenses: " + err.message, "err");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const json = await res.json();
      if (json.success) setNotifications(json.data || []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadLicenses();
    loadNotifications();
  }, [loadLicenses, loadNotifications]);

  // ── Generate licenses ──────────────────────────────────────────────────
  const handleGenerate = async () => {
    try {
      const res = await fetch("/api/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(genForm),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      const count = json.data?.length || 1;
      showToast(`✅ Generated ${count} license key${count > 1 ? "s" : ""}!`);
      setGenForm({ user_name: "", days: "30", lifetime: false, max_devices: "1", notes: "", count: "1" });
      loadLicenses();
      setActiveTab("licenses");
    } catch (err: any) {
      showToast("Generation failed: " + err.message, "err");
    }
  };

  // ── Revoke license ─────────────────────────────────────────────────────
  const handleRevoke = async (key: string) => {
    if (!confirm(`Revoke license ${key}? The user will immediately lose access.`)) return;
    try {
      const res = await fetch("/api/licenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: key, status: "revoked" }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      showToast("License revoked ✓");
      loadLicenses();
    } catch (err: any) {
      showToast("Revoke failed: " + err.message, "err");
    }
  };

  // ── Delete license ─────────────────────────────────────────────────────
  const handleDelete = async (key: string) => {
    if (!confirm(`Permanently delete license ${key}?`)) return;
    try {
      const res = await fetch(`/api/licenses?license_key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      showToast("Deleted ✓");
      loadLicenses();
    } catch (err: any) {
      showToast("Delete failed: " + err.message, "err");
    }
  };

  // ── Copy key ───────────────────────────────────────────────────────────
  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    showToast("Copied to clipboard ✓");
  };

  // ── Add notification ──────────────────────────────────────────────────
  const handleAddNotif = async () => {
    if (!notifForm.title || !notifForm.body) {
      showToast("Title and body required", "err");
      return;
    }
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifForm),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      showToast("Notification published ✓");
      setNotifForm({ title: "", body: "", type: "info" });
      loadNotifications();
    } catch (err: any) {
      showToast("Failed: " + err.message, "err");
    }
  };

  const handleToggleNotif = async (id: string, current: boolean) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !current }),
      });
      loadNotifications();
    } catch (_) {}
  };

  // ── Filtered licenses ──────────────────────────────────────────────────
  const filtered = licenses.filter((l) => {
    const matchSearch =
      !search ||
      l.license_key.toLowerCase().includes(search.toLowerCase()) ||
      (l.user_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (l.notes ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "expired" ? l.status === "expired" || isExpired(l.expires_at) : l.status === filterStatus);
    return matchSearch && matchStatus;
  });

  // ── Export CSV ─────────────────────────────────────────────────────────
  const exportCSV = () => {
    const header = "License Key,Status,User,Expires,Devices,Created,Notes\n";
    const rows = licenses.map((l) =>
      `"${l.license_key}","${l.status}","${l.user_name ?? ""}","${l.expires_at ?? "Lifetime"}","${l.device_count ?? 0}/${l.max_devices}","${fmtDate(l.created_at)}","${l.notes ?? ""}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bundlee_licenses.csv";
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#07070f]">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl transition-all
          ${toast.type === "ok" ? "bg-green-500/20 border border-green-500/40 text-green-300" : "bg-red-500/20 border border-red-500/40 text-red-300"}`}>
          {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <div className="flex min-h-screen">
        <aside className="w-64 glass border-r border-white/5 flex flex-col fixed h-full z-10">
          {/* Logo */}
          <div className="p-6 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-lg shadow-lg shadow-violet-500/20">
                🔑
              </div>
              <div>
                <p className="font-bold text-white text-sm">Bundlee Admin</p>
                <p className="text-xs text-gray-500">Loveable Unlimited v17.5</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-4 space-y-1">
            {[
              { id: "licenses", label: "Licenses", icon: "🎫" },
              { id: "generate", label: "Generate Keys", icon: "✨" },
              { id: "notifications", label: "Notifications", icon: "🔔" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer
                  ${activeTab === item.id
                    ? "bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-sm"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"}`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}

            <div className="pt-4 border-t border-white/5 mt-4">
              <a
                href="/love"
                download="Loveable-Unlimited-Extension.zip"
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer shadow-sm"
              >
                <span className="text-base">⬇️</span>
                Download Extension (.zip)
              </a>
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-white/5">
            <div className="bg-white/[0.02] p-3 rounded-xl border border-white/5">
              <p className="text-xs text-gray-400 font-medium">Supabase Host</p>
              <p className="text-[11px] text-gray-500 truncate mt-0.5">jelclpesgtcfgngmudoj</p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-64 p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold gradient-text mb-1">
              {activeTab === "licenses" && "License Keys"}
              {activeTab === "generate" && "Generate License Keys"}
              {activeTab === "notifications" && "Announcements & Notifications"}
            </h1>
            <p className="text-gray-500 text-sm">
              {activeTab === "licenses" && "Manage extension license keys, device activations, and statuses"}
              {activeTab === "generate" && "Create custom license keys with precise expiry and device limits"}
              {activeTab === "notifications" && "Broadcast real-time messages to extension users"}
            </p>
          </div>

          {/* ─── LICENSES TAB ─────────────────────────────────────────── */}
          {activeTab === "licenses" && (
            <div>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-4 mb-8">
                <StatCard label="Total Licenses" value={stats.total} icon="🎫" color="bg-violet-500/20 text-violet-400" />
                <StatCard label="Active" value={stats.active} icon="✅" color="bg-green-500/20 text-green-400" />
                <StatCard label="Expired" value={stats.expired} icon="⏰" color="bg-yellow-500/20 text-yellow-400" />
                <StatCard label="Revoked" value={stats.revoked} icon="🚫" color="bg-red-500/20 text-red-400" />
              </div>

              {/* Toolbar */}
              <div className="glass rounded-2xl p-4 mb-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px]">
                  <input
                    type="text"
                    placeholder="Search by key, user, notes..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 transition-colors"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="revoked">Revoked</option>
                </select>
                <button onClick={loadLicenses} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-colors cursor-pointer">
                  🔄 Refresh
                </button>
                <button onClick={exportCSV} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 hover:bg-white/10 transition-colors cursor-pointer">
                  📥 Export CSV
                </button>
                <button
                  onClick={() => setActiveTab("generate")}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm text-white font-medium transition-colors cursor-pointer shadow-md shadow-violet-600/20"
                >
                  ✨ Generate New
                </button>
              </div>

              {/* Table */}
              <div className="glass rounded-2xl overflow-hidden">
                {loading ? (
                  <div className="flex items-center justify-center py-24">
                    <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-24 text-gray-500">
                    <p className="text-4xl mb-3">🔑</p>
                    <p className="text-gray-400 font-medium">No licenses found</p>
                    <p className="text-xs text-gray-600 mt-1">Generate your first license key above</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5 text-gray-500 text-xs uppercase tracking-wider">
                          <th className="text-left px-5 py-4">License Key</th>
                          <th className="text-left px-4 py-4">User</th>
                          <th className="text-left px-4 py-4">Status</th>
                          <th className="text-left px-4 py-4">Expires</th>
                          <th className="text-left px-4 py-4">Devices</th>
                          <th className="text-left px-4 py-4">Created</th>
                          <th className="text-right px-5 py-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filtered.map((lic) => (
                          <tr key={lic.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <code className="font-mono text-violet-300 text-xs font-semibold tracking-wider bg-violet-500/10 px-2 py-1 rounded-lg border border-violet-500/20">
                                  {lic.license_key}
                                </code>
                                <button
                                  onClick={() => copyKey(lic.license_key)}
                                  title="Copy license key"
                                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white transition-all text-xs cursor-pointer p-1"
                                >
                                  📋
                                </button>
                              </div>
                              {lic.notes && <p className="text-xs text-gray-500 mt-1">{lic.notes}</p>}
                            </td>
                            <td className="px-4 py-4 text-gray-300 font-medium">{lic.user_name ?? <span className="text-gray-600">—</span>}</td>
                            <td className="px-4 py-4">
                              <Badge status={isExpired(lic.expires_at) ? "expired" : lic.status} />
                            </td>
                            <td className="px-4 py-4 text-gray-300">
                              {lic.expires_at
                                ? <span className={isExpired(lic.expires_at) ? "text-red-400 font-medium" : ""}>{fmtDate(lic.expires_at)}</span>
                                : <span className="text-emerald-400 font-medium">Lifetime ∞</span>}
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-white font-medium">{lic.device_count ?? 0}</span>
                              <span className="text-gray-500"> / {lic.max_devices}</span>
                            </td>
                            <td className="px-4 py-4 text-gray-500 text-xs">{fmtDate(lic.created_at)}</td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleRevoke(lic.license_key)}
                                  disabled={lic.status === "revoked"}
                                  className="px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs hover:bg-yellow-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  Revoke
                                </button>
                                <button
                                  onClick={() => handleDelete(lic.license_key)}
                                  className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs hover:bg-red-500/20 transition-colors cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-3 text-right">
                Showing {filtered.length} of {licenses.length} licenses
              </p>
            </div>
          )}

          {/* ─── GENERATE TAB ─────────────────────────────────────────── */}
          {activeTab === "generate" && (
            <div className="max-w-xl">
              <div className="glass rounded-2xl p-6 space-y-5">
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wide">Customer / User Name (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={genForm.user_name}
                    onChange={(e) => setGenForm({ ...genForm, user_name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wide">License Duration</label>
                  <div className="flex items-center gap-3 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={genForm.lifetime}
                        onChange={(e) => setGenForm({ ...genForm, lifetime: e.target.checked })}
                        className="w-4 h-4 accent-violet-500"
                      />
                      <span className="text-sm text-gray-300 font-medium">Lifetime license (no expiration date)</span>
                    </label>
                  </div>
                  {!genForm.lifetime && (
                    <div className="flex gap-2 flex-wrap items-center">
                      {["7", "14", "30", "60", "90", "180", "365"].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setGenForm({ ...genForm, days: d })}
                          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer
                            ${genForm.days === d
                              ? "bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-600/30"
                              : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"}`}
                        >
                          {d}d
                        </button>
                      ))}
                      <input
                        type="number"
                        placeholder="Custom days"
                        value={genForm.days}
                        onChange={(e) => setGenForm({ ...genForm, days: e.target.value })}
                        className="w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wide">Max Allowed Devices</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={genForm.max_devices}
                      onChange={(e) => setGenForm({ ...genForm, max_devices: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wide">Number of Keys to Generate</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={genForm.count}
                      onChange={(e) => setGenForm({ ...genForm, count: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wide">Notes / Reference (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Order #1002, Discord @client"
                    value={genForm.notes}
                    onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50"
                  />
                </div>

                {/* Preview */}
                <div className="bg-white/[0.02] rounded-xl p-4 border border-white/5">
                  <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Key Specs Preview</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Key Format</span>
                      <code className="text-violet-300 font-mono text-xs font-semibold">XXXX-XXXX-XXXX-XXXX</code>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Expires</span>
                      <span className="text-white font-medium">
                        {genForm.lifetime
                          ? "Never (Lifetime ∞)"
                          : fmtDate(new Date(Date.now() + (parseInt(genForm.days) || 30) * 86400000).toISOString())}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Device Limit</span>
                      <span className="text-white font-medium">Up to {genForm.max_devices} machine(s)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Batch Quantity</span>
                      <span className="text-white font-medium">{genForm.count} key{parseInt(genForm.count) > 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGenerate}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold text-sm transition-all shadow-lg hover:shadow-violet-500/25 cursor-pointer"
                >
                  ✨ Generate {genForm.count} License Key{parseInt(genForm.count) > 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* ─── NOTIFICATIONS TAB ────────────────────────────────────── */}
          {activeTab === "notifications" && (
            <div>
              {/* Add form */}
              <div className="glass rounded-2xl p-6 mb-6 max-w-2xl">
                <h3 className="text-sm font-semibold text-white mb-4">Broadcast In-Extension Notification</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Announcement Title"
                    value={notifForm.title}
                    onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50"
                  />
                  <textarea
                    placeholder="Message body shown in extension..."
                    value={notifForm.body}
                    onChange={(e) => setNotifForm({ ...notifForm, body: e.target.value })}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 resize-none"
                  />
                  <div className="flex items-center gap-3">
                    <select
                      value={notifForm.type}
                      onChange={(e) => setNotifForm({ ...notifForm, type: e.target.value })}
                      className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
                    >
                      <option value="info">ℹ️ Info</option>
                      <option value="success">✅ Success</option>
                      <option value="warning">⚠️ Warning</option>
                      <option value="alert">🚨 Alert</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleAddNotif}
                      className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors cursor-pointer shadow-md shadow-violet-600/20"
                    >
                      📢 Broadcast Notification
                    </button>
                  </div>
                </div>
              </div>

              {/* Notifications list */}
              <div className="space-y-3 max-w-2xl">
                {notifications.length === 0 ? (
                  <div className="glass rounded-2xl p-12 text-center text-gray-500">
                    <p className="text-3xl mb-2">🔔</p>
                    <p className="text-gray-400 font-medium">No announcements published yet</p>
                  </div>
                ) : notifications.map((n) => (
                  <div key={n.id} className={`glass rounded-xl p-4 flex items-start gap-4 ${!n.is_active ? "opacity-40" : ""}`}>
                    <span className="text-xl mt-0.5">
                      {n.type === "success" ? "✅" : n.type === "warning" ? "⚠️" : n.type === "alert" ? "🚨" : "ℹ️"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{n.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{n.body}</p>
                      <p className="text-xs text-gray-600 mt-1">{fmtDate(n.created_at)}</p>
                    </div>
                    <button
                      onClick={() => handleToggleNotif(n.id, n.is_active)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                        n.is_active
                          ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20"
                          : "bg-white/5 border-white/10 text-gray-500 hover:bg-white/10"
                      }`}
                    >
                      {n.is_active ? "Active" : "Disabled"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
