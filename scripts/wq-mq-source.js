function wQ() {
  const { items: e, mode: t, setMode: n, open: r, setOpen: o, remove: i, clear: s, totalOdds: a, placeTicket: c } = sk();
  const { user: u } = xl();
  const nav = Ms();
  const [h, p] = l.useState(10);
  const [m, v] = l.useState(false);
  const [isMob, setIsMob] = l.useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  l.useEffect(() => {
    const onResize = () => setIsMob(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const S = e.length;
  const b = t === "parlay" ? h * a : e.reduce((x, w) => x + h * Number(w.odds), 0);
  const y = t === "parlay" ? h : h * S;
  const go = async () => {
    if (!u) {
      nav("/auth");
      return;
    }
    v(true);
    await c(h);
    v(false);
  };
  if (!S) return null;
  return W.jsxs(W.Fragment, {
    children: [
      isMob
        ? W.jsxs("div", {
            className: "gd-slip-bar",
            onClick: () => o(true),
            role: "button",
            tabIndex: 0,
            children: [
              W.jsxs("span", { className: "gd-slip-bar-label", children: ["🎟 Talón · ", t === "parlay" ? "Combinada" : "Sencillas", " (", S, ")"] }),
              W.jsxs("span", { className: "gd-slip-bar-odds", children: [a.toFixed(2), " →"] }),
            ],
          })
        : W.jsxs("button", {
            type: "button",
            onClick: () => o((x) => !x),
            "aria-label": "Talón",
            style: {
              position: "fixed",
              right: 18,
              bottom: 18,
              zIndex: 60,
              background: "#1475e1",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "13px 20px",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(0,0,0,.4)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            },
            children: ["🎟 Talón ", W.jsx("span", { className: "gd-slip-badge", children: S })],
          }),
      r
        ? W.jsxs(W.Fragment, {
            children: [
              W.jsx("div", { className: "gd-slip-overlay", onClick: () => o(false) }),
              W.jsxs("div", { className: "gd-slip-panel", children: [
                W.jsxs("div", { className: "gd-slip-panel-head", children: [
                  W.jsx("b", { style: { color: "#fff", fontSize: 16 }, children: "Talón" }),
                  W.jsx("span", { className: "gd-slip-badge", children: S }),
                  W.jsx("button", {
                    type: "button",
                    onClick: () => o(false),
                    style: { marginLeft: "auto", background: "none", border: "none", color: "#8893a2", cursor: "pointer", fontSize: 20 },
                    children: "×",
                  }),
                ] }),
                W.jsx("div", { style: { padding: "10px 16px" }, children:
                  W.jsx(cV, {
                    block: true,
                    value: t,
                    onChange: n,
                    options: [
                      { label: "Combinada", value: "parlay" },
                      { label: "Sencillas", value: "singles" },
                    ],
                  }),
                }),
                W.jsxs("div", { className: "gd-slip-body", children: [
                  e.map((x) =>
                    W.jsxs("div", { className: "gd-slip-item", children: [
                      W.jsx("button", { type: "button", className: "gd-slip-item-remove", onClick: () => i(x.key), children: "×" }),
                      W.jsx("div", { className: "gd-slip-item-match", children: x.event_name }),
                      W.jsx("div", { className: "gd-slip-item-pick", children: x.selection }),
                      W.jsx("div", { className: "gd-slip-item-odd", children: Number(x.odds).toFixed(2) }),
                    ] }, x.key)
                  ),
                ] }),
                W.jsxs("div", { className: "gd-slip-foot", children: [
                  t === "parlay"
                    ? W.jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#b1bad3", fontSize: 13 }, children: [
                        W.jsx("span", { children: "Cuota combinada" }),
                        W.jsx("b", { style: { color: "#1a8cff" }, children: a.toFixed(2) }),
                      ] })
                    : null,
                  W.jsxs("div", { style: { marginBottom: 6, color: "#b1bad3", fontSize: 13 }, children: [
                    t === "parlay" ? "Monto (USDT)" : "Monto por selección (USDT)",
                  ] }),
                  W.jsx(cw, { min: 1, value: h, onChange: p, style: { width: "100%", marginBottom: 12 } }),
                  W.jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13, color: "#b1bad3" }, children: [
                    W.jsx("span", { children: "Apuesta total" }),
                    W.jsxs("b", { style: { color: "#fff" }, children: [y.toFixed(2), " USDT"] }),
                  ] }),
                  W.jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, color: "#b1bad3" }, children: [
                    W.jsx("span", { children: "Pago potencial" }),
                    W.jsxs("b", { style: { color: "#00e701" }, children: [b.toFixed(2), " USDT"] }),
                  ] }),
                  W.jsxs("div", { className: "gd-slip-actions", children: [
                    W.jsx("button", { type: "button", className: "gd-btn-clear", onClick: s, children: "Borrar apuestas" }),
                    W.jsx("button", { type: "button", className: "gd-btn-place", onClick: go, disabled: m, children: m ? "..." : u ? "Hacer apuesta" : "Iniciar sesión" }),
                  ] }),
                ] }),
              ] }),
            ],
          })
        : null,
    ],
  });
}

function KQ() {
  const nav = Ms();
  const loc = nl();
  const { items: e, setOpen: o } = sk();
  const n = e.length;
  const path = loc.pathname || "";
  const Item = ({ id, icon, label, onClick, badge }) =>
    W.jsxs("button", {
      type: "button",
      className: "gd-mobile-nav-item" + (id === "deportes" && path.startsWith("/deportes") ? " is-active" : id === "home" && path === "/" ? " is-active" : id === "slip" ? "" : ""),
      onClick,
      children: [
        badge ? W.jsx("span", { className: "gd-mobile-nav-badge", children: badge }) : null,
        W.jsx("span", { style: { fontSize: 18 }, children: icon }),
        label,
      ],
    });
  return W.jsxs("nav", { className: "gd-mobile-nav", children: [
    W.jsx(Item, { id: "home", icon: "🔍", label: "Explorar", onClick: () => nav("/") }),
    W.jsx(Item, { id: "casino", icon: "🎰", label: "Casino", onClick: () => nav("/") }),
    W.jsx(Item, { id: "slip", icon: "📋", label: "Talón", badge: n || null, onClick: () => o(true) }),
    W.jsx(Item, { id: "deportes", icon: "⚽", label: "Deportes", onClick: () => nav("/deportes") }),
    W.jsx(Item, { id: "chat", icon: "💬", label: "Chat", onClick: () => {} }),
  ] });
}
