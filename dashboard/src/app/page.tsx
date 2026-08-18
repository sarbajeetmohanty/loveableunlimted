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
  plan_name?: string;
};

type Account = {
  id: string;
  email: string;
  password_hash: string;
  status: "active" | "expired" | "revoked" | "pending";
  max_devices: number;
  expires_at: string | null;
  created_at: string;
  plan_name?: string;
  notes?: string;
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, expired: 0, revoked: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"licenses" | "accounts" | "generate" | "create_account" | "notifications">("licenses");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Generate License form state
  const [genForm, setGenForm] = useState({
    user_name: "",
    days: "30",
    lifetime: false,
    max_devices: "1",
    notes: "",
    count: "1",
  });

  // Create Account form state
  const [accForm, setAccForm] = useState({
    email: "",
    password: "",
    days: "365",
    lifetime: false,
    max_devices: "5",
    notes: "",
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

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const json = await res.json();
      if (json.success) {
        setAccounts(json.data || []);
      }
    } catch (_) {}
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
    loadAccounts();
    loadNotifications();
  }, [loadLicenses, loadAccounts, loadNotifications]);

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

  // ── Create Account ─────────────────────────────────────────────────────
  const handleCreateAccount = async () => {
    if (!accForm.email || !accForm.password) {
      showToast("Email and password are required", "err");
      return;
    }
    try {
      const expires_at = accForm.lifetime
        ? null
        : new Date(Date.now() + Number(accForm.days) * 86400000).toISOString();

      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: accForm.email,
          password: accForm.password,
          max_devices: Number(accForm.max_devices),
          expires_at,
          notes: accForm.notes,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      showToast(`✅ Account created for ${accForm.email}!`);
      setAccForm({ email: "", password: "", days: "365", lifetime: false, max_devices: "5", notes: "" });
      loadAccounts();
      setActiveTab("accounts");
    } catch (err: any) {
      showToast("Account creation failed: " + err.message, "err");
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
    if (!confirm(`Permanently delete ${key}?`)) return;
    try {
      const res = await fetch(`/api/licenses?license_key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      showToast("Deleted ✓");
      loadLicenses();
      loadAccounts();
    } catch (err: any) {
      showToast("Delete failed: " + err.message, "err");
    }
  };

  // ── Copy text ──────────────────────────────────────────────────────────
  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
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
  const filteredLicenses = licenses.filter((l) => {
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

  return (
    <div className="min-h-screen bg-[#07070f] text-white p-6 sm:p-10 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-medium transition-all ${
            toast.type === "ok" ? "bg-emerald-500/90 text-white" : "bg-rose-500/90 text-white"
          }`}
        >
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚡</span>
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-indigo-300">
              Bundlee Admin
            </h1>
            <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs px-2.5 py-0.5 rounded-full font-mono">
              Dual-Auth v2.0
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            License keys, user accounts, and OTA updates for Loveable Unlimited
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/love"
            download="Loveable-Unlimited-Extension.zip"
            className="px-4 py-2 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-pink-600/20 transition-all flex items-center gap-2"
          >
            <span>📥</span> Download Extension (.zip)
          </a>
        </div>
      </header>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Licenses" value={stats.total} icon="🔑" color="bg-indigo-500/10 text-indigo-400" />
        <StatCard label="Active Accounts" value={stats.active} icon="✅" color="bg-emerald-500/10 text-emerald-400" />
        <StatCard label="Expired / Due" value={stats.expired} icon="⏰" color="bg-amber-500/10 text-amber-400" />
        <StatCard label="Revoked" value={stats.revoked} icon="🚫" color="bg-rose-500/10 text-rose-400" />
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-800/80 pb-4 mb-6">
        <button
          onClick={() => setActiveTab("licenses")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === "licenses"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "text-gray-400 hover:text-white hover:bg-gray-800/40"
          }`}
        >
          🔑 License Keys ({licenses.length})
        </button>

        <button
          onClick={() => setActiveTab("accounts")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === "accounts"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "text-gray-400 hover:text-white hover:bg-gray-800/40"
          }`}
        >
          👥 User Accounts ({accounts.length})
        </button>

        <button
          onClick={() => setActiveTab("generate")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === "generate"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "text-gray-400 hover:text-white hover:bg-gray-800/40"
          }`}
        >
          ➕ Generate Keys
        </button>

        <button
          onClick={() => setActiveTab("create_account")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === "create_account"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "text-gray-400 hover:text-white hover:bg-gray-800/40"
          }`}
        >
          👤 Create User Account
        </button>

        <button
          onClick={() => setActiveTab("notifications")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === "notifications"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "text-gray-400 hover:text-white hover:bg-gray-800/40"
          }`}
        >
          🔔 In-App Announcements
        </button>
      </div>

      {/* TAB 1: License Keys Table */}
      {activeTab === "licenses" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-gray-900/40 p-3 rounded-xl border border-gray-800">
            <input
              type="text"
              placeholder="Search by license key, user, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-80 bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex items-center gap-3">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-800/80 glass">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900/60 text-xs uppercase font-semibold text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="px-6 py-4">License Key</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Plan / User</th>
                  <th className="px-6 py-4">Devices</th>
                  <th className="px-6 py-4">Expires</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50 font-mono">
                {filteredLicenses.map((lic) => (
                  <tr key={lic.id} className="hover:bg-gray-800/20 transition-colors">
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-2">
                      <span>{lic.license_key}</span>
                      <button
                        onClick={() => copyText(lic.license_key)}
                        className="text-gray-500 hover:text-white transition-colors"
                        title="Copy Key"
                      >
                        📋
                      </button>
                    </td>
                    <td className="px-6 py-4 font-sans">
                      <Badge status={lic.status} />
                    </td>
                    <td className="px-6 py-4 font-sans">
                      <div className="text-white font-medium">{lic.plan_name || "Monthly Plan"}</div>
                      <div className="text-xs text-gray-400">{lic.notes || "—"}</div>
                    </td>
                    <td className="px-6 py-4">
                      {lic.device_count ?? 0} / {lic.max_devices}
                    </td>
                    <td className="px-6 py-4 font-sans text-xs">{fmtDate(lic.expires_at)}</td>
                    <td className="px-6 py-4 text-right font-sans space-x-2">
                      {lic.status === "active" && (
                        <button
                          onClick={() => handleRevoke(lic.license_key)}
                          className="px-2.5 py-1 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-lg text-xs"
                        >
                          Revoke
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(lic.license_key)}
                        className="px-2.5 py-1 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-lg text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: User Accounts */}
      {activeTab === "accounts" && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-gray-800/80 glass">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-gray-900/60 text-xs uppercase font-semibold text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="px-6 py-4">Account Email</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Plan</th>
                  <th className="px-6 py-4">Devices</th>
                  <th className="px-6 py-4">Expires</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50 font-sans">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-gray-800/20 transition-colors">
                    <td className="px-6 py-4 font-bold text-white flex items-center gap-2 font-mono">
                      <span>{acc.email}</span>
                      <button
                        onClick={() => copyText(acc.email)}
                        className="text-gray-500 hover:text-white transition-colors"
                        title="Copy Email"
                      >
                        📋
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <Badge status={acc.status} />
                    </td>
                    <td className="px-6 py-4 font-medium text-white">{acc.plan_name || "Pro Unlimited"}</td>
                    <td className="px-6 py-4 font-mono">{acc.max_devices} devices</td>
                    <td className="px-6 py-4 text-xs">{fmtDate(acc.expires_at)}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleDelete(acc.email)}
                        className="px-2.5 py-1 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-lg text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Generate Keys */}
      {activeTab === "generate" && (
        <div className="max-w-2xl mx-auto glass p-8 rounded-3xl border border-gray-800/80">
          <h2 className="text-xl font-bold text-white mb-6">➕ Generate New License Keys</h2>
          <div className="space-y-4 font-sans">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                User / Note Description
              </label>
              <input
                type="text"
                placeholder="e.g. Paid customer / Discord user"
                value={genForm.user_name}
                onChange={(e) => setGenForm({ ...genForm, user_name: e.target.value })}
                className="w-full bg-gray-950/60 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Duration (Days)
                </label>
                <input
                  type="number"
                  disabled={genForm.lifetime}
                  value={genForm.days}
                  onChange={(e) => setGenForm({ ...genForm, days: e.target.value })}
                  className="w-full bg-gray-950/60 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Max Devices
                </label>
                <input
                  type="number"
                  value={genForm.max_devices}
                  onChange={(e) => setGenForm({ ...genForm, max_devices: e.target.value })}
                  className="w-full bg-gray-950/60 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="lifetime"
                checked={genForm.lifetime}
                onChange={(e) => setGenForm({ ...genForm, lifetime: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="lifetime" className="text-sm text-gray-300">
                Lifetime Access (No Expiration)
              </label>
            </div>

            <button
              onClick={handleGenerate}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all text-sm mt-4"
            >
              Generate License Key
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: Create User Account */}
      {activeTab === "create_account" && (
        <div className="max-w-2xl mx-auto glass p-8 rounded-3xl border border-gray-800/80">
          <h2 className="text-xl font-bold text-white mb-6">👤 Create User Account (Email + Password)</h2>
          <div className="space-y-4 font-sans">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                User Email Address
              </label>
              <input
                type="email"
                placeholder="customer@example.com"
                value={accForm.email}
                onChange={(e) => setAccForm({ ...accForm, email: e.target.value })}
                className="w-full bg-gray-950/60 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="text"
                placeholder="Enter password (e.g. user123)"
                value={accForm.password}
                onChange={(e) => setAccForm({ ...accForm, password: e.target.value })}
                className="w-full bg-gray-950/60 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Duration (Days)
                </label>
                <input
                  type="number"
                  disabled={accForm.lifetime}
                  value={accForm.days}
                  onChange={(e) => setAccForm({ ...accForm, days: e.target.value })}
                  className="w-full bg-gray-950/60 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Max Devices
                </label>
                <input
                  type="number"
                  value={accForm.max_devices}
                  onChange={(e) => setAccForm({ ...accForm, max_devices: e.target.value })}
                  className="w-full bg-gray-950/60 border border-gray-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="acc-lifetime"
                checked={accForm.lifetime}
                onChange={(e) => setAccForm({ ...accForm, lifetime: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="acc-lifetime" className="text-sm text-gray-300">
                Lifetime Access
              </label>
            </div>

            <button
              onClick={handleCreateAccount}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all text-sm mt-4"
            >
              Create Account
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: Announcements */}
      {activeTab === "notifications" && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="glass p-6 rounded-2xl border border-gray-800">
            <h3 className="text-lg font-bold text-white mb-4">📢 Post In-App Announcement</h3>
            <div className="space-y-3 font-sans">
              <input
                type="text"
                placeholder="Title (e.g. Maintenance Notice)"
                value={notifForm.title}
                onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })}
                className="w-full bg-gray-950/60 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <textarea
                placeholder="Message body shown to all active extension users..."
                rows={3}
                value={notifForm.body}
                onChange={(e) => setNotifForm({ ...notifForm, body: e.target.value })}
                className="w-full bg-gray-950/60 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleAddNotif}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl"
              >
                Broadcast Announcement
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {notifications.map((n) => (
              <div key={n.id} className="glass p-4 rounded-xl border border-gray-800 flex justify-between items-center">
                <div>
                  <h4 className="font-bold text-white text-sm">{n.title}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">{n.body}</p>
                </div>
                <button
                  onClick={() => handleToggleNotif(n.id, n.is_active)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    n.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {n.is_active ? "Active" : "Archived"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
