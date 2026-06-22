function NQ() {
  const { user: e } = xl();
  const { balance: t } = Cl();
  const { add: n } = sk();
  const nav = Ms();
  const [sp] = WA();
  const viewQ = sp.get("view");
  const sportF = sp.get("sport");
  const [rows, setRows] = l.useState([]);
  const [tab, setTab] = l.useState("home");
  const [sel, setSel] = l.useState(null);
  const [race, setRace] = l.useState(null);
  const [srch, setSrch] = l.useState("");
  const [mTab, setMTab] = l.useState("main");
  const [xMk, setXMk] = l.useState(null);
  const [ldMk, setLdMk] = l.useState(false);

  l.useEffect(() => {
    if (viewQ === "live") setTab("live");
  }, [viewQ]);

  const load = l.useCallback(async () => {
    const past = new Date(Date.now() - 4 * 3600000).toISOString();
    const future = new Date(Date.now() + 72 * 3600000).toISOString();
    const { data } = await Nn.from("live_odds")
      .select("*")
      .gte("commence_time", past)
      .lte("commence_time", future)
      .order("commence_time", { ascending: true })
      .limit(800);
    setRows((data || []).filter((q) => q.sport !== "horses" || q.home_odds != null));
  }, []);

  l.useEffect(() => {
    load();
    const ch = Nn.channel("odds_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_odds" }, load)
      .subscribe();
    const tm = setInterval(load, 60000);
    return () => {
      Nn.removeChannel(ch);
      clearInterval(tm);
    };
  }, [load]);

  l.useEffect(() => {
    setSel(null);
    setRace(null);
    setXMk(null);
  }, [sportF]);

  const eventActive = (g) => {
    if (g.winner != null) return false;
    const st = lg(g);
    if (st === "finished" || st === "other") return false;
    if (st === "upcoming") return true;
    const elapsed = Date.now() - new Date(g.commence_time).getTime();
    const maxLive = g.sport === "horses" ? 90 * 60000 : 2.5 * 3600000;
    return elapsed <= maxLive;
  };

  const q = srch.trim().toLowerCase();
  let list = rows.filter((g) => !sportF || g.sport === sportF);
  list = list.filter(eventActive);
  if (q)
    list = list.filter((g) =>
      `${g.home_team} ${g.away_team} ${g.league} ${g.sport}`.toLowerCase().includes(q)
    );
  const live = list.filter((g) => lg(g) === "live");
  const up = list.filter((g) => lg(g) === "upcoming");
  const shown = tab === "live" ? live : [...live, ...up];

  const pick = (g, od, ty, label) => {
    if (od == null) return;
    n({
      key: `${g.id}::${ty}::${label}`,
      event_id: g.id,
      event_name: g.sport === "horses" ? g.league : `${g.home_team} vs ${g.away_team}`,
      selection: label,
      odds: Number(od),
    });
  };

  const fmtTime = (g) => {
    const ms = new Date(g.commence_time).getTime() - Date.now();
    if (ms <= 0) return lg(g) === "live" ? _Q(g) : "Pronto";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const buildMkts = (g) => {
    const mk = [];
    const h2 = [];
    if (g.home_odds != null)
      h2.push({ lb: "1", nm: g.home_team, od: g.home_odds, ty: "1x2", sel: `${g.home_team} (Local)` });
    if (g.draw_odds != null) h2.push({ lb: "X", nm: "Empate", od: g.draw_odds, ty: "1x2", sel: "Empate" });
    if (g.away_odds != null)
      h2.push({ lb: "2", nm: g.away_team, od: g.away_odds, ty: "1x2", sel: `${g.away_team} (Visitante)` });
    if (h2.length) mk.push({ t: "1x2", items: h2 });
    const hc = [];
    if (g.home_spread_odds != null)
      hc.push({
        lb: String(g.home_spread ?? ""),
        nm: g.home_team,
        od: g.home_spread_odds,
        ty: "handicap",
        sel: `${g.home_team} ${g.home_spread}`,
      });
    if (g.away_spread_odds != null)
      hc.push({
        lb: String(g.away_spread ?? ""),
        nm: g.away_team,
        od: g.away_spread_odds,
        ty: "handicap",
        sel: `${g.away_team} ${g.away_spread}`,
      });
    if (hc.length) mk.push({ t: "Handicap", items: hc });
    const tt = [];
    if (g.over_odds != null)
      tt.push({ lb: "+", nm: `Más ${g.total_line}`, od: g.over_odds, ty: "total", sel: `Más ${g.total_line}` });
    if (g.under_odds != null)
      tt.push({ lb: "-", nm: `Menos ${g.total_line}`, od: g.under_odds, ty: "total", sel: `Menos ${g.total_line}` });
    if (tt.length) mk.push({ t: `Total ${g.total_line ?? ""}`.trim(), items: tt });
    return mk;
  };

  const loadExtra = async (g) => {
    const evId = String(g.id || "").startsWith("tb_") ? String(g.id).split("_").pop() : null;
    if (!evId || xMk || ldMk) return;
    setLdMk(true);
    try {
      const r = await fetch(
        `https://sb2frontend-altenar2.biahosted.com/api/Widget/GetEventDetails?integration=triunfobet&culture=es-ES&eventId=${evId}`
      );
      if (!r.ok) return;
      const C = await r.json();
      const od = Object.fromEntries((C.odds || []).map((o) => [o.id, o]));
      const skip = /^1x2|hándicap|handicap|total|ganador/i;
      const mk = (C.markets || []).filter((m) => m.name && !skip.test(m.name)).slice(0, 16);
      setXMk(
        mk
          .map((m) => {
            const outs = [];
            for (const row of m.desktopOddIds || [])
              for (const oid of row) {
                const o = od[oid];
                if (o) outs.push({ n: (o.name || "") + (m.sv ? " " + m.sv : ""), p: o.price });
              }
            return { t: m.name, outs: outs.slice(0, 16) };
          })
          .filter((m) => m.outs.length)
      );
    } catch (_) {
    } finally {
      setLdMk(false);
    }
  };

  l.useEffect(() => {
    if (sel) {
      setXMk(null);
      loadExtra(sel);
    }
  }, [sel?.id]);

  const OddBtn = ({ label, sub, odds, onClick, chip }) => {
    const p = IQ(odds);
    return W.jsxs("button", {
      type: "button",
      className: "st-odd-pill gd-odd-btn" + (p == null ? " is-disabled" : "") + (chip ? " is-chip" : ""),
      onClick: (ev) => {
        ev.stopPropagation();
        onClick();
      },
      disabled: p == null,
      children: [
        W.jsx("span", { className: "st-odd-label gd-odd-label", children: label }),
        sub ? W.jsx("span", { className: "gd-odd-sub", children: sub }) : null,
        W.jsx("span", { className: "st-odd-price gd-odd-price", children: p ?? "–" }),
      ],
    });
  };

  const MkGrid = ({ g, mkts }) =>
    mkts.map((sec, si) =>
      W.jsxs("div", { className: "st-accordion gd-market-block", children: [
        W.jsx("div", { className: "st-accordion-head gd-market-title", children: sec.t }),
        W.jsx("div", { className: "st-accordion-body st-odds-row gd-odds-grid", children:
          sec.items.map((it, ii) =>
            W.jsx(
              OddBtn,
              {
                label: it.lb === "1" || it.lb === "2" || it.lb === "X" ? it.lb : it.nm,
                sub: it.lb !== "1" && it.lb !== "2" && it.lb !== "X" ? it.lb : void 0,
                odds: it.od,
                chip: true,
                onClick: () => pick(g, it.od, it.ty, it.sel),
              },
              si + "-" + ii
            )
          ),
        }),
      ] }, si)
    );

  const FeaturedCard = ({ g }) =>
    W.jsxs("div", {
      className: "st-featured-card",
      onClick: () => setSel(g),
      children: [
        W.jsxs("div", { className: "st-card-meta", children: [
          W.jsx("span", { className: "st-time-badge", children: fmtTime(g) }),
          lg(g) === "live" ? W.jsx("span", { className: "gd-live-pill", children: "EN VIVO" }) : null,
          W.jsxs("span", { className: "st-bets-count", children: ["⚽ ", g.league || rI(g.sport)] }),
        ] }),
        W.jsxs("div", { className: "st-teams-row", children: [
          W.jsxs("div", { className: "st-team-col", children: [
            W.jsx(ag, { name: g.home_team, size: 36 }),
            W.jsx("div", { className: "st-team-name", children: g.home_team }),
            g.home_score != null ? W.jsx("span", { className: "gd-score", children: g.home_score }) : null,
          ] }),
          W.jsx("span", { className: "st-vs", children: "VS" }),
          W.jsxs("div", { className: "st-team-col", children: [
            W.jsx(ag, { name: g.away_team, size: 36 }),
            W.jsx("div", { className: "st-team-name", children: g.away_team }),
            g.away_score != null ? W.jsx("span", { className: "gd-score", children: g.away_score }) : null,
          ] }),
        ] }),
        W.jsxs("div", { className: "st-trend", children: ["🔥 Cuotas en vivo · ", g.league || rI(g.sport)] }),
        W.jsx("div", {
          className: "st-odds-row",
          onClick: (ev) => ev.stopPropagation(),
          children: buildMkts(g)[0]
            ? buildMkts(g)[0].items.map((it, ii) =>
                W.jsx(
                  OddBtn,
                  {
                    label: it.lb,
                    odds: it.od,
                    chip: true,
                    onClick: () => pick(g, it.od, it.ty, it.sel),
                  },
                  ii
                )
              )
            : null,
        }),
      ],
    });

  const groupRaces = (arr) => {
    const m = new Map();
    for (const g of arr) {
      const k = `${g.league}|${g.commence_time}`;
      if (!m.has(k)) m.set(k, { league: g.league, time: g.commence_time, horses: [] });
      m.get(k).horses.push(g);
    }
    return [...m.values()].sort((a, b) => new Date(a.time) - new Date(b.time));
  };

  const raceCd = (time) => {
    const min = Math.ceil((new Date(time).getTime() - Date.now()) / 60000);
    if (min <= 0) return { t: "0MIN", c: "urgent" };
    if (min <= 3) return { t: min + "MIN", c: "urgent" };
    if (min <= 8) return { t: min + "MIN", c: "warn" };
    return { t: min + "MIN", c: "ok" };
  };

  const horseColors = ["#e53935", "#fff", "#2563eb", "#eab308", "#7c3aed", "#111", "#16a34a", "#f97316"];
  const horseIcon = W.jsx("img", { className: "st-race-icon", src: "./images/horse-racing.svg", alt: "", "aria-hidden": true });

  const HorseUI = () => {
    const races = groupRaces(shown);
    const active = race || races[0] || null;
    const nums = (name) => (name || "").match(/^#(\d+)/);
    const wps = (h, kind) => {
      const w = h.home_odds;
      if (w == null) return null;
      if (kind === "W") return w;
      if (kind === "P") return +(Number(w) * 0.45).toFixed(2);
      return +(Number(w) * 0.28).toFixed(2);
    };
    return W.jsxs("div", {
      className: "st-page st-horse-layout" + (race ? " show-race" : ""),
      children: [
        W.jsx("div", {
          className: "st-race-list mobile-only",
          children: races.map((rc) => {
            const cd = raceCd(rc.time);
            const track = (rc.league || "").split(" - ")[0] || rc.league;
            const num = (rc.league || "").match(/Carrera\s+(\d+)/i);
            return W.jsxs(
              "div",
              {
                className: "st-race-item" + (active === rc ? " is-active" : ""),
                onClick: () => setRace(rc),
                children: [
                  horseIcon,
                  W.jsxs("div", { className: "st-race-info", children: [
                    W.jsx("div", { className: "st-race-track", children: `${track.toUpperCase()}${num ? " #" + num[1] : ""}` }),
                  ] }),
                  W.jsx("span", { className: "st-race-countdown " + cd.c, children: cd.t }),
                ],
              },
              rc.league + rc.time
            );
          }),
        }),
        W.jsxs("div", { className: "st-race-list", children: races.map((rc) => {
          const cd = raceCd(rc.time);
          const track = (rc.league || "").split(" - ")[0] || rc.league;
          const num = (rc.league || "").match(/Carrera\s+(\d+)/i);
          return W.jsxs("div", {
            className: "st-race-item" + (active === rc ? " is-active" : ""),
            onClick: () => setRace(rc),
            children: [
              horseIcon,
              W.jsxs("div", { className: "st-race-info", children: [
                W.jsx("div", { className: "st-race-track", children: `${track.toUpperCase()}${num ? " #" + num[1] : ""}` }),
              ] }),
              W.jsx("span", { className: "st-race-countdown " + cd.c, children: cd.t }),
            ],
          }, rc.league + rc.time);
        }) }),
        active
          ? W.jsxs("div", { className: "st-race-panel", children: [
              W.jsxs("div", { className: "st-race-panel-head", children: [
                W.jsx("button", {
                  type: "button",
                  className: "st-detail-back",
                  style: { color: "#fff", marginBottom: 0, marginRight: 8 },
                  onClick: () => setRace(null),
                  children: "←",
                }),
                W.jsx("img", { className: "st-race-icon st-race-icon-inline", src: "./images/horse-racing.svg", alt: "" }),
                active.league,
              ] }),
              W.jsxs("div", { className: "st-race-meta-bar", children: [
                W.jsxs("span", { children: ["📅 ", new Date(active.time).toLocaleString("es")] }),
                W.jsx("span", { children: "Win / Place / Show" }),
              ] }),
              W.jsxs("div", { className: "st-race-panel-scroll", children: [
              W.jsxs("table", { className: "st-wps-table", children: [
                W.jsx("thead", { children: W.jsxs("tr", { children: [
                  W.jsx("th", { children: "N#" }),
                  W.jsx("th", { children: "Caballo / Jinete" }),
                  W.jsx("th", { children: "Logro" }),
                  W.jsx("th", { children: "WIN" }),
                  W.jsx("th", { children: "PLACE" }),
                  W.jsx("th", { children: "SHOW" }),
                ] }) }),
                W.jsx("tbody", { children: active.horses.map((h, idx) => {
                  const pg = nums(h.home_team);
                  const n = pg ? parseInt(pg[1], 10) : idx + 1;
                  return W.jsxs("tr", { children: [
                    W.jsx("td", { children: W.jsx("div", {
                      className: "st-horse-num",
                      style: { background: horseColors[(n - 1) % horseColors.length], color: n === 2 ? "#111" : "#fff" },
                      children: n,
                    }) }),
                    W.jsxs("td", { children: [
                      W.jsx("div", { className: "st-horse-name", children: (h.home_team || "").replace(/^#\d+\s*/, "") }),
                      W.jsx("div", { className: "st-horse-jockey", children: h.away_team || "Jinete" }),
                    ] }),
                    W.jsxs("td", { className: "st-horse-ml", children: ["ODD ", IQ(h.home_odds)] }),
                    ["W", "P", "S"].map((k) =>
                      W.jsx("td", { children: W.jsx("button", {
                        type: "button",
                        className: "st-wps-btn",
                        onClick: () => pick(h, wps(h, k), "horse_" + k.toLowerCase(), `${h.home_team} (${k})`),
                        children: IQ(wps(h, k)),
                      }) }, k)
                    ),
                  ] }, h.id);
                }) }),
              ] }),
              ] }),
            ] })
          : W.jsx("div", { className: "gd-empty", children: "Selecciona una carrera" }),
      ],
    });
  };

  if (sportF === "horses") {
    return W.jsxs("div", { className: "gd-sports-page", children: [
      W.jsx("div", { className: "gd-sport-title", children: "Hipismo" }),
      shown.length ? W.jsx(HorseUI, {}) : W.jsxs("div", { className: "gd-empty", children: [
        "No hay carreras disponibles.",
        W.jsx("span", { className: "gd-empty-sub", children: "Las cuotas se actualizan cada pocos minutos." }),
      ] }),
    ] });
  }

  if (sel) {
    const mkts = buildMkts(sel);
    const filtered = mTab === "main" ? mkts : [...mkts, ...(xMk || []).map((m) => ({ t: m.t, items: m.outs.map((o) => ({ lb: o.n, nm: o.n, od: o.p, ty: "prop", sel: o.n })) }))];
    return W.jsxs("div", { className: "st-page gd-sports-page", children: [
      W.jsx("button", { type: "button", className: "st-detail-back", onClick: () => setSel(null), children: "← Volver" }),
      W.jsxs("div", { className: "st-detail-hero", children: [
        W.jsxs("div", { className: "st-teams-row", children: [
          W.jsxs("div", { className: "st-team-col", children: [
            W.jsx(ag, { name: sel.home_team, size: 48 }),
            W.jsx("div", { className: "st-team-name", children: sel.home_team }),
          ] }),
          W.jsxs("div", { style: { textAlign: "center" }, children: [
            W.jsx("div", { style: { color: "#b1bad3", fontSize: 12 }, children: new Date(sel.commence_time).toLocaleString("es") }),
            W.jsx("div", { className: "gd-score", children: sel.home_score != null ? `${sel.home_score} - ${sel.away_score}` : "vs" }),
          ] }),
          W.jsxs("div", { className: "st-team-col", children: [
            W.jsx(ag, { name: sel.away_team, size: 48 }),
            W.jsx("div", { className: "st-team-name", children: sel.away_team }),
          ] }),
        ] }),
        W.jsx("div", { style: { color: "#8893a2", fontSize: 13, marginTop: 8 }, children: sel.league }),
      ] }),
      W.jsxs("div", { className: "st-detail-tabs", children: [
        W.jsx("button", { type: "button", className: "st-detail-tab" + (mTab === "main" ? " is-active" : ""), onClick: () => setMTab("main"), children: "Principal" }),
        W.jsx("button", { type: "button", className: "st-detail-tab" + (mTab === "more" ? " is-active" : ""), onClick: () => setMTab("more"), children: "Más mercados" }),
      ] }),
      W.jsx("input", { className: "st-search", placeholder: "Buscar mercado...", value: srch, onChange: (ev) => setSrch(ev.target.value) }),
      ldMk ? W.jsx("div", { style: { color: "#8893a2", padding: 12 }, children: "Cargando mercados..." }) : null,
      filtered
        .filter((sec) => !q || sec.t.toLowerCase().includes(q))
        .map((sec, si) =>
          W.jsxs("div", { className: "st-accordion", children: [
            W.jsx("div", { className: "st-accordion-head", children: sec.t }),
            W.jsx("div", { className: "st-accordion-body st-odds-row gd-odds-grid", children:
              sec.items.map((it, ii) =>
                W.jsx(OddBtn, {
                  label: it.lb === "1" || it.lb === "2" || it.lb === "X" ? it.lb : it.nm || it.lb,
                  sub: it.lb !== "1" && it.lb !== "2" && it.lb !== "X" && it.nm ? it.lb : void 0,
                  odds: it.od,
                  chip: true,
                  onClick: () => pick(sel, it.od, it.ty, it.sel),
                }, si + "-" + ii)
              ),
            }),
          ] }, si)
        ),
    ] });
  }

  const featured = shown.filter((g) => g.sport !== "horses").slice(0, 3);
  const leagues = {};
  for (const g of shown.filter((x) => x.sport !== "horses")) {
    const L = g.league || rI(g.sport);
    if (!leagues[L]) leagues[L] = [];
    leagues[L].push(g);
  }

  return W.jsxs("div", { className: "st-page gd-sports-page", children: [
    W.jsx("input", { className: "st-search", placeholder: "Buscar eventos...", value: srch, onChange: (ev) => setSrch(ev.target.value) }),
    W.jsxs("div", { className: "st-toggle-row gd-tabs", children: [
      W.jsx("button", { type: "button", className: "st-toggle gd-tab" + (tab === "home" ? " is-active" : ""), onClick: () => setTab("home"), children: "⚽ Inicio de Deportes" }),
      W.jsxs("button", { type: "button", className: "st-toggle gd-tab" + (tab === "live" ? " is-active" : ""), onClick: () => setTab("live"), children: [
        "▶ Apuestas en vivo ",
        live.length > 0 ? W.jsx("span", { className: "gd-live-badge", children: live.length }) : null,
      ] }),
    ] }),
    e ? W.jsxs("div", { className: "gd-balance", children: ["Saldo: ", W.jsxs("b", { children: [t.toFixed(2), " USDT"] })] }) : null,
    sportF ? W.jsx("div", { className: "gd-sport-title", children: rI(sportF) }) : null,
    shown.length
      ? W.jsxs(W.Fragment, { children: [
          !sportF && featured.length ? W.jsxs(W.Fragment, { children: [
            W.jsxs("div", { className: "st-section-head", children: [W.jsx("span", { className: "icon", children: "💰" }), "Partidos destacados"] }),
            featured.map((g) => W.jsx(FeaturedCard, { g }, g.id)),
          ] }) : null,
          tab !== "live" && live.length > 0 ? W.jsxs("div", { className: "gd-section-title", children: [W.jsx("span", { className: "gd-live-dot" }), " En vivo"] }) : null,
          tab === "live"
            ? live.map((g) => W.jsx(FeaturedCard, { g }, g.id))
            : Object.entries(leagues).map(([L, evs]) =>
                W.jsxs("div", { className: "st-league-block", children: [
                  W.jsxs("div", { className: "st-league-title", children: ["⚽ ", L] }),
                  evs.map((g) => W.jsx(FeaturedCard, { g }, g.id)),
                ] }, L)
              ),
        ] })
      : W.jsx("div", { className: "gd-empty", children: "Sin eventos por ahora." }),
  ] });
}
