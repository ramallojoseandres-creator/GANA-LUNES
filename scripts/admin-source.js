function AQ() {
  const { isAdmin: e, loading: t } = Cl();
  const { message: n, modal: r } = cl.useApp();
  const [tab, setTab] = l.useState("stats");
  const [o, i] = l.useState([]);
  const [s, a] = l.useState(!0);
  const [c, u] = l.useState(null);
  const [d, f] = l.useState(0);
  const [h, p] = l.useState("");
  const [bets, setBets] = l.useState([]);
  const [betsLoading, setBetsLoading] = l.useState(!1);
  const [stats, setStats] = l.useState(null);
  const [statsLoading, setStatsLoading] = l.useState(!1);

  const fmt = (v) =>
    Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const loadUsers = l.useCallback(async () => {
    a(!0);
    const { data: y, error: g } = await Nn.rpc("admin_list_users");
    g ? n.error("No autorizado o error: " + g.message) : i(y || []);
    a(!1);
  }, [n]);

  const loadBets = l.useCallback(async () => {
    setBetsLoading(!0);
    const { data, error } = await Nn.rpc("admin_list_bets", { p_limit: 200, p_offset: 0 });
    error ? n.error("Apuestas: " + error.message + (error.message.includes("autorizado") ? " — vuelve a ejecutar admin-dashboard.sql en Supabase" : "")) : setBets(data || []);
    setBetsLoading(!1);
  }, [n]);

  const loadStats = l.useCallback(async () => {
    setStatsLoading(!0);
    const { data, error } = await Nn.rpc("admin_company_stats");
    error ? n.error("Resumen: " + error.message + (error.message.includes("autorizado") ? " — vuelve a ejecutar admin-dashboard.sql en Supabase" : "")) : setStats(data || null);
    setStatsLoading(!1);
  }, [n]);

  const refreshAll = l.useCallback(async () => {
    await Promise.all([loadStats(), loadBets(), loadUsers()]);
  }, [loadStats, loadBets, loadUsers]);

  l.useEffect(() => {
    if (!t && e) refreshAll();
  }, [t, e, refreshAll]);

  const v = async () => {
    const { error: y } = await Nn.rpc("admin_adjust_balance", {
      p_user_id: c.user_id,
      p_amount: d,
      p_reason: h || "ajuste manual",
    });
    if (y) return n.error(y.message);
    n.success("Saldo ajustado");
    u(null);
    f(0);
    p("");
    loadUsers();
  };

  const S = (y) => {
    r.confirm({
      title: y.is_blocked ? `¿Desbloquear a ${y.username}?` : `¿Bloquear a ${y.username}?`,
      onOk: async () => {
        const { error: g } = await Nn.rpc("admin_set_blocked", {
          p_user_id: y.user_id,
          p_blocked: !y.is_blocked,
        });
        if (g) return n.error(g.message);
        n.success("Listo");
        loadUsers();
      },
    });
  };

  if (!t && !e) {
    return W.jsxs("div", {
      style: { padding: 60, textAlign: "center", color: "#b1bad3" },
      children: [
        W.jsx(sI, { level: 4, style: { color: "#fff" }, children: "Acceso restringido" }),
        W.jsx(MQ, { type: "secondary", children: "Esta sección es solo para administradores." }),
      ],
    });
  }

  const total = Number(stats?.total || 0);
  const statCard = (label, value, color) =>
    W.jsxs("div", {
      className: "gd-admin-stat",
      children: [
        W.jsx("div", { className: "gd-admin-stat-label", children: label }),
        W.jsx("div", { className: "gd-admin-stat-value", style: { color: color || "#fff" }, children: fmt(value) }),
        W.jsx("span", { className: "gd-admin-stat-unit", children: "USDT" }),
      ],
    });

  const userCols = [
    {
      title: "Usuario",
      dataIndex: "username",
      key: "username",
      fixed: "left",
      render: (y, g) =>
        W.jsxs("span", {
          children: [y, " ", g.is_blocked && W.jsx(xw, { color: "red", children: "Bloqueado" })],
        }),
    },
    { title: "Correo", dataIndex: "email", key: "email" },
    { title: "Cédula", dataIndex: "cedula", key: "cedula", render: (y) => y || "—" },
    { title: "Teléfono", dataIndex: "phone", key: "phone", render: (y) => y || "—" },
    {
      title: "Saldo (USDT)",
      dataIndex: "balance_usdt",
      key: "balance",
      render: (y) => W.jsx("b", { style: { color: "#f0b429" }, children: fmt(y) }),
      sorter: (y, g) => y.balance_usdt - g.balance_usdt,
    },
    {
      title: "Depósitos",
      key: "dep",
      render: (y, g) => `${fmt(g.deposit_total)} (${g.deposit_count})`,
    },
    {
      title: "Registro",
      dataIndex: "created_at",
      key: "created",
      render: (y) => new Date(y).toLocaleDateString("es"),
    },
    {
      title: "Últ. acceso",
      dataIndex: "last_sign_in",
      key: "last",
      render: (y) => (y ? new Date(y).toLocaleString("es") : "—"),
    },
    {
      title: "Acciones",
      key: "act",
      fixed: "right",
      render: (y, g) =>
        W.jsxs(Bu, {
          children: [
            W.jsx(In, {
              size: "small",
              onClick: () => {
                u(g);
                f(0);
                p("");
              },
              children: "Saldo",
            }),
            W.jsx(In, {
              size: "small",
              danger: !g.is_blocked,
              onClick: () => S(g),
              children: g.is_blocked ? "Desbloquear" : "Bloquear",
            }),
          ],
        }),
    },
  ];

  const betCols = [
    {
      title: "Fecha",
      dataIndex: "created_at",
      key: "created_at",
      width: 150,
      render: (y) => new Date(y).toLocaleString("es"),
    },
    { title: "Usuario", dataIndex: "username", key: "username", width: 120 },
    { title: "Correo", dataIndex: "email", key: "email", width: 160, ellipsis: !0 },
    {
      title: "Tipo",
      dataIndex: "source",
      key: "source",
      width: 90,
      render: (y) => W.jsx(xw, { color: y === "casino" ? "purple" : "blue", children: y === "casino" ? "Casino" : "Deportes" }),
    },
    { title: "Evento", dataIndex: "event_name", key: "event_name", ellipsis: !0 },
    { title: "Selección", dataIndex: "selection", key: "selection", ellipsis: !0 },
    {
      title: "Apuesta",
      dataIndex: "stake",
      key: "stake",
      width: 100,
      render: (y) => W.jsx("b", { style: { color: "#f0b429" }, children: fmt(y) }),
    },
    {
      title: "Cuota",
      dataIndex: "odds",
      key: "odds",
      width: 80,
      render: (y) => (y != null && y > 0 ? Number(y).toFixed(2) : "—"),
    },
    {
      title: "Pago / Pot.",
      dataIndex: "payout",
      key: "payout",
      width: 110,
      render: (y) => fmt(y),
    },
    {
      title: "Estado",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (y) => {
        const s = String(y || "").toLowerCase();
        const color = /won|win|paid|ganad/.test(s) ? "green" : /lost|lose|perdid/.test(s) ? "red" : "gold";
        return W.jsx(xw, { color, children: y || "—" });
      },
    },
  ];

  return W.jsxs("div", {
    className: "gd-admin-page",
    style: { padding: "8px 4px 60px" },
    children: [
      W.jsxs("div", {
        style: { display: "flex", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" },
        children: [
          W.jsx(sI, { level: 3, style: { color: "#fff", margin: 0 }, children: "Panel de administración" }),
          W.jsx(In, { onClick: refreshAll, loading: s || betsLoading || statsLoading, style: { marginLeft: "auto" }, children: "Actualizar" }),
        ],
      }),
      W.jsx("div", { style: { marginBottom: 16 }, children:
        W.jsx(cV, {
          block: !0,
          value: tab,
          onChange: setTab,
          options: [
            { label: "Resumen", value: "stats" },
            { label: "Apuestas", value: "bets" },
            { label: "Usuarios", value: "users" },
          ],
        })
      }),
      tab === "stats" &&
        W.jsxs(W.Fragment, {
          children: [
            W.jsxs("div", { className: "gd-admin-stats-grid", children: [
              statCard("Jugado", stats?.jugado, "#fff"),
              statCard("Ganado (pagado)", stats?.ganado, "#00e701"),
              statCard("Perdido (usuarios)", stats?.perdido, "#ff6b6b"),
              statCard("En juego", stats?.pendiente, "#f0b429"),
            ] }),
            W.jsxs("div", {
              className: "gd-admin-total-card",
              children: [
                W.jsx("div", { className: "gd-admin-total-label", children: "Balance neto de la casa" }),
                W.jsxs("div", {
                  className: "gd-admin-total-value",
                  style: { color: total >= 0 ? "#00e701" : "#ff4757" },
                  children: [total >= 0 ? "+" : "", fmt(total), " USDT"],
                }),
                W.jsx("div", { className: "gd-admin-total-hint", children: "Ganancia neta en apuestas resueltas (deportes + casino). Positivo = la casa va ganando." }),
              ],
            }),
          ],
        }),
      tab === "bets" &&
        W.jsx(Qo, {
          rowKey: "bet_id",
          columns: betCols,
          dataSource: bets,
          loading: betsLoading,
          scroll: { x: 1200 },
          size: "middle",
          pagination: { pageSize: 25, showSizeChanger: !0 },
        }),
      tab === "users" &&
        W.jsx(Qo, {
          rowKey: "user_id",
          columns: userCols,
          dataSource: o,
          loading: s,
          scroll: { x: 1100 },
          size: "middle",
          pagination: { pageSize: 25, showSizeChanger: !0 },
        }),
      W.jsxs(lo, {
        open: !!c,
        onCancel: () => u(null),
        onOk: v,
        title: `Ajustar saldo · ${(c == null ? void 0 : c.username) || ""}`,
        okText: "Aplicar",
        cancelText: "Cancelar",
        children: [
          W.jsx("p", { style: { color: "#888" }, children: "Usa positivo para sumar, negativo para restar." }),
          W.jsx(cw, { value: d, onChange: (y) => f(y || 0), style: { width: "100%" }, size: "large", addonAfter: "USDT" }),
          W.jsx(yr, { style: { marginTop: 10 }, placeholder: "Motivo (opcional)", value: h, onChange: (y) => p(y.target.value) }),
        ],
      }),
    ],
  });
}
