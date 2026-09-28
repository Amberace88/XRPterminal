/**
 * XRP Terminal Academy (spec §121, §292). Original educational content.
 * Principles: accurate, neutral, no profit promises, uncertainty stated plainly,
 * links to the terminal tool where the concept can be explored with real data.
 */

export interface AcademySection {
  heading: string;
  body: string[];
  bullets?: string[];
}

export interface AcademyTool {
  href: string;
  label: string;
  description: string;
}

export type AcademyTrack = "Foundations" | "Market mechanics" | "Research" | "Practice";

export interface AcademyModule {
  slug: string;
  number: number;
  title: string;
  summary: string;
  track: AcademyTrack;
  level: "Beginner" | "Intermediate";
  sections: AcademySection[];
  takeaways: string[];
  tools: AcademyTool[];
}

export const ACADEMY_TRACKS: { id: AcademyTrack; description: string }[] = [
  { id: "Foundations", description: "What XRP and the XRP Ledger are, and how markets price them." },
  { id: "Market mechanics", description: "Candles, orders, risk and position sizing — the mechanics behind every trade." },
  { id: "Research", description: "Indicators, on-chain data, history and backtesting — and their limits." },
  { id: "Practice", description: "Rehearse with simulation, design rules, keep a journal, avoid classic errors." },
];

export const ACADEMY_MODULES: AcademyModule[] = [
  {
    slug: "what-is-xrp",
    number: 1,
    title: "What is XRP?",
    summary: "The native asset of the XRP Ledger: supply, units, what it is used for and how it differs from Ripple the company.",
    track: "Foundations",
    level: "Beginner",
    sections: [
      {
        heading: "The native asset of the XRP Ledger",
        body: [
          "XRP is the native digital asset of the XRP Ledger (XRPL), an open-source public blockchain that has been running since 2012. \"Native\" means XRP is built into the protocol itself: it does not depend on an issuer or a trust line, and it can be sent between any two funded accounts on the ledger.",
          "All XRP that will ever exist was created when the ledger launched: 100 billion units. There is no mining and no protocol mechanism that creates new XRP. The total supply actually shrinks very slowly, because the small transaction cost paid with every transaction is destroyed rather than paid to anyone.",
        ],
      },
      {
        heading: "What XRP does on the ledger",
        body: ["Beyond being transferable value, XRP has several protocol-level roles:"],
        bullets: [
          "Transaction costs — every transaction burns a small amount of XRP, which makes spamming the network expensive.",
          "Reserves — accounts must hold a minimum XRP balance to exist and to own ledger objects such as trust lines or offers.",
          "Bridge asset — the built-in exchange can automatically route a trade between two tokens through XRP when that gives a better rate (auto-bridging).",
          "Settlement features — escrow, payment channels and checks can all be denominated in XRP.",
        ],
      },
      {
        heading: "Units: XRP and drops",
        body: [
          "The smallest unit of XRP is a drop: 1 XRP equals 1,000,000 drops. Ledger APIs usually report XRP amounts in drops, as strings, to avoid floating-point rounding errors. XRP Terminal converts drops to XRP for display, but when you read raw ledger data you will see the drop values.",
        ],
      },
      {
        heading: "XRP is not Ripple",
        body: [
          "Ripple is a private company that uses XRP in some of its products and received a large XRP allocation at launch. In 2017 Ripple placed 55 billion XRP into on-ledger escrows that release on a monthly schedule; unused amounts have typically been placed back into new escrows. Because escrows are ledger objects, their balances and release dates are publicly verifiable.",
          "The XRP Ledger itself is operated by independent servers and validators around the world. Ripple runs some of them, but the protocol does not require Ripple to function. XRP Terminal is independent software and is not affiliated with, endorsed by, or sponsored by Ripple Labs Inc.",
        ],
      },
      {
        heading: "Price is a market outcome",
        body: [
          "The price of XRP is not set by the ledger. It emerges from trading on many exchanges, each with its own order book, liquidity and quote currency. That is why two venues can show slightly different prices at the same moment, and why XRP Terminal always shows which source a price came from and how fresh it is. Supply figures such as \"circulating supply\" also differ between data providers because they use different methodologies.",
          "XRP is volatile. Its price has experienced deep drawdowns and long recoveries, and regulatory developments in different countries have moved it sharply. Understanding the asset does not remove those risks.",
        ],
      },
    ],
    takeaways: [
      "100 billion XRP were created at launch; no mining exists and transaction costs are burned.",
      "1 XRP = 1,000,000 drops — raw ledger data uses drops.",
      "XRP pays transaction costs, satisfies reserves and can act as a bridge asset in the built-in exchange.",
      "The XRP Ledger, XRP and Ripple the company are distinct things.",
      "Market price is set by exchanges, so always check source and freshness.",
    ],
    tools: [
      { href: "/market", label: "Market", description: "Live XRP price with source and freshness." },
      { href: "/xrpl", label: "XRPL Explorer", description: "Inspect accounts, escrows and transactions directly." },
      { href: "/historical", label: "Historical", description: "Drawdowns, recoveries and cycles since 2017." },
    ],
  },
  {
    slug: "what-is-xrpl",
    number: 2,
    title: "What is the XRP Ledger?",
    summary: "Consensus, accounts and reserves, built-in features and how the protocol evolves through amendments.",
    track: "Foundations",
    level: "Beginner",
    sections: [
      {
        heading: "A public ledger without mining",
        body: [
          "The XRP Ledger is a decentralized, permissionless blockchain launched in 2012 by David Schwartz, Jed McCaleb and Arthur Britto. Its reference server software, rippled, is open source. Anyone can run a server, read the full ledger and submit transactions.",
          "Instead of proof-of-work mining or proof-of-stake, the XRPL uses the XRP Ledger Consensus Protocol. Each server trusts a list of validators (its Unique Node List, or UNL). Validators repeatedly agree on which transactions to include, and a new ledger version is validated roughly every three to five seconds. Once a ledger is validated, its transactions are final — there is no need to wait for several confirmations.",
        ],
      },
      {
        heading: "Accounts, reserves and tags",
        body: [
          "A classic XRPL address starts with the letter \"r\". An address only becomes an account once it receives enough XRP to meet the base reserve. Each object the account owns — a trust line, an open offer, an escrow — adds an owner reserve. Reserve amounts are set by validator voting and have changed over time; in December 2024 they were lowered to 1 XRP base and 0.2 XRP per owned object. Always check the current values before relying on them.",
          "Exchanges often use one shared account for many customers and distinguish deposits with a destination tag. Sending to an exchange without the required tag is a common and costly mistake. X-addresses are an alternative format that encodes the address and tag together.",
        ],
      },
      {
        heading: "Built-in features",
        body: ["Many features that other chains implement with smart contracts are native protocol objects on the XRPL:"],
        bullets: [
          "Decentralized exchange — on-ledger order books have existed since launch.",
          "Automated market maker (AMM) — liquidity pools, enabled on mainnet in 2024, that work alongside the order books.",
          "Issued tokens — any account can issue tokens that others hold through trust lines, including stablecoins such as RLUSD.",
          "Escrow, payment channels and checks — conditional and streaming payments.",
          "NFTs (XLS-20) and multi-signing for shared control of an account.",
        ],
      },
      {
        heading: "How the protocol changes",
        body: [
          "Changes to ledger rules are introduced as amendments. An amendment activates only after it keeps support from more than 80% of trusted validators for two continuous weeks. This makes upgrades deliberate and publicly visible — you can see which amendments are enabled and which are being voted on.",
        ],
      },
      {
        heading: "Transaction costs",
        body: [
          "The minimum transaction cost is 10 drops (0.00001 XRP). When the network is busy, servers require a higher cost, which rises with load. The cost is destroyed, not collected by validators, so validators have no fee income motive to include or exclude transactions.",
        ],
      },
    ],
    takeaways: [
      "Consensus among trusted validators replaces mining; ledgers validate every ~3–5 seconds with finality.",
      "Accounts need a reserve; owned objects add to it. Reserve values are set by validator vote.",
      "Destination tags matter when sending to shared exchange accounts.",
      "The DEX, AMM, tokens, escrow and NFTs are native features.",
      "Amendments require >80% validator support for two weeks.",
    ],
    tools: [
      { href: "/xrpl", label: "XRPL Explorer", description: "Look up accounts, transactions and ledgers." },
      { href: "/xrpl/activity", label: "Network activity", description: "Transaction mix and ledger throughput." },
      { href: "/portfolio", label: "Portfolio", description: "Track a public address read-only." },
    ],
  },
  {
    slug: "market-basics",
    number: 3,
    title: "Market basics",
    summary: "Order books, spreads, liquidity, volume, market cap and volatility — the vocabulary behind every price.",
    track: "Foundations",
    level: "Beginner",
    sections: [
      {
        heading: "The order book",
        body: [
          "Most exchanges match buyers and sellers through an order book. The highest price a buyer is currently willing to pay is the bid; the lowest price a seller will accept is the ask. The gap between them is the spread. The \"last price\" you see on a chart is simply where the most recent trade happened.",
          "Depth describes how much volume sits at each price level. A thin book means a relatively small order can move the price several levels — this is called market impact.",
        ],
      },
      {
        heading: "Liquidity, volume and venues",
        body: [
          "Liquidity is the ability to trade meaningful size without moving the price much. Volume is how much traded over a period. High reported volume does not always mean high liquidity: volume can be concentrated in short bursts, and some venues have historically reported inflated figures.",
          "XRP trades on many venues against many quote currencies (USD, EUR, USDT, BTC and others). A USDT pair is not identical to a USD pair — USDT is a stablecoin whose price can deviate slightly from one dollar. XRP Terminal labels when a USDT market is used as a USD proxy.",
        ],
      },
      {
        heading: "Market capitalization",
        body: [
          "Market cap is price multiplied by circulating supply. It is a convenient size comparison, but it is not the amount of money that was invested, and it cannot all be realised: selling a large fraction of supply would push the price down. Different providers also count circulating supply differently.",
        ],
      },
      {
        heading: "Volatility",
        body: [
          "Volatility measures how much returns vary, usually as the standard deviation of daily returns, often annualised. Crypto markets trade 24/7 and are typically far more volatile than major equity indices. High volatility means wider ranges of outcomes in both directions — it is a measure of uncertainty, not of opportunity.",
        ],
      },
      {
        heading: "Time and data quality",
        body: ["Professional analysis starts with knowing exactly what you are looking at:"],
        bullets: [
          "Which venue and quote currency does this price come from?",
          "When was it produced, and when was it fetched? Is it live, recent or stale?",
          "Are candles bucketed in UTC or local time?",
          "Was any data aggregated, converted or gap-filled?",
        ],
      },
    ],
    takeaways: [
      "Bid, ask and spread describe the current market; last price is only the latest trade.",
      "Liquidity and volume are related but not the same.",
      "USDT pairs are proxies, not identical to USD.",
      "Market cap is a size comparison, not invested capital.",
      "Always check source, time and freshness before interpreting a number.",
    ],
    tools: [
      { href: "/market", label: "Market", description: "Prices, spreads and venue sources." },
      { href: "/historical", label: "Volatility history", description: "How volatile XRP has been over time." },
      { href: "/calculators", label: "Calculators", description: "P&L and scenario maths." },
    ],
  },
  {
    slug: "candlesticks",
    number: 4,
    title: "Candlesticks",
    summary: "How OHLC candles are built, why the last candle changes, and how much weight to give to classic patterns.",
    track: "Market mechanics",
    level: "Beginner",
    sections: [
      {
        heading: "Anatomy of a candle",
        body: [
          "A candlestick summarises all trades within a fixed time window using four prices: open, high, low and close (OHLC). The body spans open to close; the thin lines above and below — the wicks or shadows — reach the high and low. A candle is typically coloured green (or hollow) when close is above open and red when close is below open.",
          "Most charts also show volume for each window, which helps separate moves that happened on heavy participation from moves on thin trading.",
        ],
      },
      {
        heading: "Timeframes and the unfinished candle",
        body: [
          "The same market looks different on a 5-minute, 1-hour or daily chart. Higher timeframes are built by aggregating lower ones into fixed buckets. XRP Terminal uses UTC buckets, so a daily candle runs from 00:00 to 24:00 UTC regardless of your time zone.",
          "The most recent candle is incomplete until its window closes. Its high, low and close keep changing — a \"pattern\" that appears mid-candle can disappear by the close. Rules that act on incomplete candles are a common source of misleading backtests.",
        ],
      },
      {
        heading: "Reading context",
        body: ["Useful questions when reading candles:"],
        bullets: [
          "Where did the price close relative to the range? A close near the high shows buyers held control into the close of that window.",
          "Long wicks show prices that were visited but rejected within the window.",
          "Is the candle unusually large compared with recent ones? Measures such as ATR put size in context.",
          "Did volume confirm the move, or was it quiet?",
        ],
      },
      {
        heading: "Named patterns: use with care",
        body: [
          "Patterns such as the doji, hammer or engulfing candle are widely taught. On their own they tend to have weak and inconsistent predictive value, and they are easy to see in hindsight. If a pattern matters to your process, define it precisely, test it on historical data with realistic costs, and compare its results with a simple benchmark.",
        ],
      },
      {
        heading: "Linear vs logarithmic scale",
        body: [
          "On a linear scale, equal distances represent equal price differences. On a log scale, equal distances represent equal percentage changes. For long periods with large price ranges — such as XRP since 2017 — a log scale makes moves comparable across time.",
        ],
      },
    ],
    takeaways: [
      "A candle is open, high, low and close for one time window, usually with volume.",
      "The last candle is unfinished until the window closes.",
      "Context — range, wick, size, volume — matters more than pattern names.",
      "Test any pattern before trusting it.",
      "Use a log scale to compare moves over long periods.",
    ],
    tools: [
      { href: "/market", label: "Advanced charts", description: "Candles across timeframes with overlays." },
      { href: "/trade-lab/replay", label: "Historical replay", description: "Practise reading candles bar by bar (simulated)." },
    ],
  },
  {
    slug: "order-types",
    number: 5,
    title: "Market, limit & stop orders",
    summary: "What each order type guarantees — and what it does not — including how offers work on the XRPL DEX.",
    track: "Market mechanics",
    level: "Beginner",
    sections: [
      {
        heading: "Market orders: certainty of execution",
        body: [
          "A market order executes immediately against the best available prices in the order book. You know it will fill (if liquidity exists) but not the exact price. The difference between the price you expected and your average fill is slippage, which grows with order size and with thinner books.",
        ],
      },
      {
        heading: "Limit orders: certainty of price",
        body: [
          "A limit order sets the worst price you accept — a maximum for a buy, a minimum for a sell. It fills only at that price or better, and it may never fill. Limit orders that rest on the book add liquidity (often called maker orders); orders that execute immediately remove liquidity (taker orders). Many exchanges charge makers lower fees than takers.",
        ],
      },
      {
        heading: "Stop and stop-limit orders",
        body: [
          "A stop order stays dormant until the market reaches a trigger price, then becomes a market order. It is commonly used as a stop loss. Because it becomes a market order, fast moves can fill it well beyond the trigger.",
          "A stop-limit order becomes a limit order at the trigger. It protects against a bad fill price but may not fill at all if the market moves through the limit — which is exactly when a stop loss is most needed. Understand this trade-off before choosing either.",
        ],
      },
      {
        heading: "Take profit, OCO and time in force",
        body: ["Common additions to basic order types:"],
        bullets: [
          "Take-profit — a limit order to close a position at a target.",
          "OCO (one-cancels-other) — pairs a stop and a take-profit; when one fills, the other is cancelled.",
          "Good-till-cancelled (GTC) — rests until filled or cancelled.",
          "Immediate-or-cancel (IOC) — fill what you can now, cancel the rest.",
          "Fill-or-kill (FOK) — fill the whole order immediately or not at all.",
        ],
      },
      {
        heading: "Offers on the XRP Ledger DEX",
        body: [
          "On the XRPL's built-in exchange, orders are \"offers\" created with an OfferCreate transaction. An offer is effectively a limit order. Flags change its behaviour: immediate-or-cancel, fill-or-kill, passive (do not cross an equal offer) and sell (sell the full amount even if you receive more than asked). The protocol has no native stop orders — any stop logic runs off-ledger. Open offers also add to your owner reserve.",
        ],
      },
      {
        heading: "Practising safely",
        body: [
          "XRP Terminal's Trade Lab lets you place market, limit, stop, stop-limit, take-profit and stop-loss orders with virtual capital. Fills include a fee and slippage model so results are not unrealistically perfect. Everything there is simulated: no real orders are ever sent to an exchange.",
        ],
      },
    ],
    takeaways: [
      "Market orders guarantee execution, not price; limit orders guarantee price, not execution.",
      "Stops become market orders; stop-limits may not fill.",
      "Time-in-force rules control how long an order lives.",
      "XRPL DEX offers are limit orders with flags; there are no native stops on-ledger.",
      "Rehearse order handling in the simulated Trade Lab first.",
    ],
    tools: [
      { href: "/trade-lab", label: "Trade Lab", description: "Simulated order types with fees and slippage." },
      { href: "/market", label: "Market", description: "See spreads and recent trades." },
    ],
  },
  {
    slug: "risk-management",
    number: 6,
    title: "Risk management",
    summary: "Drawdown mathematics, concentration, leverage and operational risk — deciding what you can lose before you act.",
    track: "Market mechanics",
    level: "Beginner",
    sections: [
      {
        heading: "Start with what you can lose",
        body: [
          "Risk management begins before any trade: decide how much of your capital you are prepared to lose on a single idea and in total, and make those limits explicit. The goal is not to avoid all losses — that is impossible — but to keep any single mistake or bad period from being unrecoverable.",
        ],
      },
      {
        heading: "The asymmetry of losses",
        body: [
          "Losses and gains are not symmetric. After a loss, you need a larger percentage gain just to get back to where you started:",
        ],
        bullets: [
          "−10% requires +11.1% to recover",
          "−25% requires +33.3%",
          "−50% requires +100%",
          "−75% requires +300%",
          "−90% requires +900%",
        ],
      },
      {
        heading: "Concentration and correlation",
        body: [
          "Holding several crypto-assets is not the same as being diversified: during market-wide sell-offs, correlations between crypto-assets tend to rise, so positions that looked independent fall together. Concentration in one asset, one venue or one strategy increases the impact of a single failure.",
        ],
      },
      {
        heading: "Leverage",
        body: [
          "Leverage multiplies both gains and losses and adds liquidation risk: a leveraged position can be closed automatically at a loss by the venue before your thesis has time to play out. With high leverage, ordinary volatility is enough to wipe out a position. XRP Terminal does not offer leverage or real trading; if you study leveraged products elsewhere, account for funding costs and liquidation mechanics.",
        ],
      },
      {
        heading: "Operational and counterparty risk",
        body: ["Some of the largest losses in crypto come from outside the market:"],
        bullets: [
          "Never share a seed phrase or private key — no legitimate service needs it. XRP Terminal will never ask for one.",
          "Phishing sites and fake support accounts imitate real brands.",
          "Assets held on an exchange depend on that exchange's solvency and security.",
          "Sending to the wrong address or without a destination tag can be irreversible.",
        ],
      },
      {
        heading: "Scenarios, not certainties",
        body: [
          "A useful habit is to think in ranges: what happens to your portfolio if the price falls 30% or 60%, or if a venue halts withdrawals? XRP Terminal's scenario ranges and stress tests show plausible outcomes with their uncertainty. They are not predictions, and history does not guarantee what will happen next.",
        ],
      },
    ],
    takeaways: [
      "Set loss limits per idea and in total before acting.",
      "Recovering from a drawdown requires a disproportionately large gain.",
      "Crypto correlations rise in sell-offs; diversification within crypto is limited.",
      "Leverage adds liquidation risk on top of price risk.",
      "Protect keys and seed phrases — nobody legitimate will ask for them.",
    ],
    tools: [
      { href: "/historical", label: "Stress testing", description: "Apply historical drawdowns to today." },
      { href: "/future", label: "Future scenarios", description: "Scenario ranges with uncertainty." },
      { href: "/calculators", label: "Calculators", description: "Scenario and P&L calculators." },
    ],
  },
  {
    slug: "position-sizing",
    number: 7,
    title: "Position sizing",
    summary: "Fixed-fractional sizing, stop distance, volatility-based stops and why small risk per trade survives losing streaks.",
    track: "Market mechanics",
    level: "Intermediate",
    sections: [
      {
        heading: "Size follows risk, not conviction",
        body: [
          "Position sizing answers one question: how large should this position be so that, if my stop is hit, I lose no more than I decided in advance? The most common method is fixed-fractional sizing — risking a fixed percentage of current equity on each trade.",
        ],
      },
      {
        heading: "The formula",
        body: [
          "Risk amount = equity × risk percentage. Position size = risk amount ÷ (entry price − stop price) for a long position.",
          "Example: with equity of 10,000 USD and a 1% risk limit, the risk amount is 100 USD. If you plan to buy at 0.60 with a stop at 0.54, the stop distance is 0.06 per XRP. Position size = 100 ÷ 0.06 ≈ 1,666 XRP, a notional value of about 1,000 USD. The position is 10% of equity, but the planned loss is 1%.",
          "Real losses can exceed the plan: fees, slippage and fast markets can fill a stop worse than its trigger. Include a cost buffer in the calculation.",
        ],
      },
      {
        heading: "Volatility-based stops",
        body: [
          "A stop placed too close is triggered by normal noise; too far and the position must be tiny. One approach is to set the stop as a multiple of the Average True Range (ATR), for example two times the 14-period ATR below entry. When volatility rises, the stop widens and the position size automatically shrinks, keeping the risk amount constant.",
        ],
      },
      {
        heading: "Why small risk per trade matters",
        body: [
          "Even a sound approach experiences losing streaks. Compare ten consecutive losses at different risk levels:",
        ],
        bullets: [
          "1% per trade → roughly 9.6% total drawdown",
          "2% per trade → roughly 18.3%",
          "5% per trade → roughly 40.1%",
          "10% per trade → roughly 65.1%",
        ],
      },
      {
        heading: "A note on optimal-growth formulas",
        body: [
          "Formulas such as the Kelly criterion compute a theoretically optimal fraction from win rate and payoff ratio. They assume those inputs are known precisely, which they never are in markets. Estimates from a small sample can be badly wrong, so many practitioners who use such formulas apply only a fraction of the suggested size.",
        ],
      },
      {
        heading: "Shorts and total open risk",
        body: [
          "For a short position the stop sits above the entry, so the stop distance is stop price minus entry price; the rest of the formula is the same.",
          "Also track the total risk of all open positions together, sometimes called portfolio heat. Five positions that each risk 1% can lose about 5% at once if they move together — and crypto-assets often do during sell-offs. Many disciplined traders cap total open risk at a few percent of equity.",
        ],
      },
    ],
    takeaways: [
      "Decide the risk amount first; derive the position size from the stop distance.",
      "Notional size and risk are different numbers.",
      "Include fees and slippage — stops can fill worse than planned.",
      "ATR-based stops adapt position size to volatility.",
      "Small risk per trade keeps losing streaks survivable.",
    ],
    tools: [
      { href: "/calculators#position-size", label: "Position size calculator", description: "Apply the formula with your numbers." },
      { href: "/trade-lab", label: "Trade Lab", description: "Practise sizing with virtual capital." },
    ],
  },
  {
    slug: "technical-indicators",
    number: 8,
    title: "Technical indicators",
    summary: "What moving averages, RSI, MACD, Bollinger Bands, ATR and VWAP measure — and the traps in using them.",
    track: "Research",
    level: "Intermediate",
    sections: [
      {
        heading: "Indicators are transformations",
        body: [
          "A technical indicator is a formula applied to price and sometimes volume. It does not contain information that is not already in the data; it reorganises it to highlight trend, momentum, volatility or participation. Because indicators summarise the past, most of them lag.",
        ],
      },
      {
        heading: "Trend: moving averages",
        body: [
          "A simple moving average (SMA) is the mean of the last N closes. An exponential moving average (EMA) weights recent closes more heavily, so it reacts faster. Crossovers and the slope of an average are common trend filters. Longer averages are smoother but slower.",
        ],
      },
      {
        heading: "Momentum: RSI and MACD",
        body: [
          "The Relative Strength Index (RSI), usually over 14 periods, compares the size of recent gains with recent losses on a 0–100 scale. Readings above 70 or below 30 are often called overbought or oversold, but in strong trends RSI can stay at extremes for a long time.",
          "MACD is the difference between a 12-period and a 26-period EMA, with a 9-period EMA of that difference as a signal line. It describes changes in the strength and direction of a trend.",
        ],
      },
      {
        heading: "Volatility and participation",
        body: ["Three widely used measures:"],
        bullets: [
          "Bollinger Bands — a 20-period SMA with bands two standard deviations above and below; the band width tracks volatility.",
          "Average True Range (ATR) — the average of the true range over 14 periods, used for stops and position sizing.",
          "VWAP — the volume-weighted average price over a session, a common reference for execution quality.",
        ],
      },
      {
        heading: "Common traps",
        body: ["Indicators become dangerous when used carelessly:"],
        bullets: [
          "Redundancy — RSI, stochastics and MACD often say the same thing; five agreeing indicators may be one signal counted five times.",
          "Parameter fitting — tuning lengths until a backtest looks good usually fits noise.",
          "Lookahead — an indicator computed with future data looks brilliant in a backtest and fails live.",
          "Ignoring regime — trend tools struggle in ranges; mean-reversion tools struggle in trends.",
        ],
      },
      {
        heading: "How XRP Terminal computes them",
        body: [
          "Every indicator in XRP Terminal is computed causally: the value at a bar uses only data available up to that bar. That is essential for replay and backtesting, and it means what you see on a historical bar is what you could have known at the time.",
        ],
      },
    ],
    takeaways: [
      "Indicators reorganise price data; most of them lag.",
      "Overbought is not a sell signal and oversold is not a buy signal.",
      "Avoid redundant indicators and over-tuned parameters.",
      "Causal computation prevents lookahead bias.",
      "Match the tool to the market regime.",
    ],
    tools: [
      { href: "/market", label: "Advanced charts", description: "Overlay indicators on live candles." },
      { href: "/trade-lab/strategy", label: "Strategy Lab", description: "Build and test indicator rules (simulated)." },
    ],
  },
  {
    slug: "on-chain-analysis",
    number: 9,
    title: "On-chain analysis",
    summary: "What the XRP Ledger's public data can tell you — and the interpretation mistakes that make it misleading.",
    track: "Research",
    level: "Intermediate",
    sections: [
      {
        heading: "Everything is public — nothing is labelled",
        body: [
          "Every validated XRPL transaction is public: payments, offers, trust-line changes, escrow creation and release, AMM deposits and withdrawals. On-chain analysis turns this raw record into measurements of network use. The data itself is factual; the meaning you attach to it is interpretation.",
          "Addresses are pseudonymous. An address has no name attached unless someone publishes the link. Labels such as \"exchange\" or \"issuer\" come from public disclosures, heuristics or third parties, and they can be wrong.",
        ],
      },
      {
        heading: "Useful measurements",
        body: ["Metrics commonly derived from ledger data:"],
        bullets: [
          "Transaction count and type mix per ledger or per day.",
          "Payment volume, and how much of it is XRP versus issued tokens.",
          "Newly funded accounts and active accounts.",
          "XRP burned through transaction costs.",
          "DEX and AMM activity for specific pairs.",
          "Large transfers between known entities, such as exchanges or escrows.",
        ],
      },
      {
        heading: "Interpretation traps",
        body: ["The same transaction can mean very different things:"],
        bullets: [
          "A large transfer is not a sale. It may be an internal move between an exchange's own wallets or custody reorganisation.",
          "Exchange accounts pool many customers, so one address can represent thousands of people.",
          "Scheduled escrow releases are predictable and are usually not news.",
          "Activity spikes can be spam, testing or wash activity rather than real adoption.",
          "Correlation between on-chain activity and price is not causation, and it changes over time.",
        ],
      },
      {
        heading: "Provenance for labels",
        body: [
          "Good on-chain research shows where each label came from and how confident it is. XRP Terminal attaches provenance to wallet labels and marks unverified information clearly, so you can judge a conclusion by the quality of its inputs.",
        ],
      },
      {
        heading: "A practical workflow",
        body: [
          "Start with a question (\"Is exchange-related activity rising?\"), choose the metric that answers it, check the data for anomalies, compare against history, and only then form a view — while writing down what would prove you wrong. Resist building a story first and hunting for transactions that confirm it.",
        ],
      },
      {
        heading: "Tokens, partial payments and the AMM",
        body: [
          "Not all value moving on the XRPL is XRP. Issued tokens, including stablecoins, move over trust lines, and their value depends on the issuer. When reading payment volume, separate XRP from tokens and check whether each issuer is known.",
          "Payments can also be partial: the delivered_amount field, not the requested Amount, shows what actually arrived. Tools that read only the requested amount can overstate volume. AMM pool balances change with every swap, deposit and withdrawal, and LP tokens represent shares of a pool.",
        ],
      },
    ],
    takeaways: [
      "Ledger data is factual; interpretation is not.",
      "Addresses are pseudonymous; labels need provenance.",
      "Large transfers are not necessarily sales.",
      "Exchange wallets aggregate many users.",
      "Begin with a question and a falsifiable hypothesis.",
    ],
    tools: [
      { href: "/xrpl/whales", label: "Whale transactions", description: "Large transfers streamed from the ledger." },
      { href: "/xrpl/activity", label: "Network activity", description: "Transaction mix and throughput." },
      { href: "/xrpl", label: "XRPL Explorer", description: "Inspect any account or transaction." },
    ],
  },
  {
    slug: "historical-analysis",
    number: 10,
    title: "Historical analysis",
    summary: "Returns, drawdowns, recoveries and analogues — using history for base rates without mistaking it for a forecast.",
    track: "Research",
    level: "Intermediate",
    sections: [
      {
        heading: "Why history is useful",
        body: [
          "History does not tell you what will happen next, but it gives base rates: how large drawdowns have been, how long recoveries took, how volatile different periods were. Base rates help you size positions and set expectations that are grounded in evidence rather than hope.",
        ],
      },
      {
        heading: "Core measurements",
        body: ["The building blocks of historical analysis:"],
        bullets: [
          "Returns over fixed windows, often as log returns so they can be added across periods.",
          "Drawdown — the percentage decline from a previous peak — and maximum drawdown.",
          "Recovery time — how long it took to regain a previous peak, if it happened at all.",
          "Distance from the all-time high and time since it was set.",
          "Rolling volatility, which reveals calm and turbulent regimes.",
          "Seasonality — average returns by month or weekday, and whether they are statistically meaningful.",
        ],
      },
      {
        heading: "The limits of the sample",
        body: [
          "XRP's reliable daily market history covers only a handful of major market cycles. Any statistic drawn from a few cycles has wide uncertainty. Seasonal averages from eight or nine observations per month can be dominated by a single extreme year. Early data from thinly traded venues is also less reliable than recent data.",
          "Markets change structurally — new participants, products and regulations — so relationships that held in one era may not hold in the next.",
        ],
      },
      {
        heading: "Historical analogues",
        body: [
          "Analogue analysis finds past periods that resemble the present on chosen features, then shows what followed. It is a way to generate a range of plausible paths, not a prediction. Similar starting conditions have often led to very different outcomes, and the choice of features strongly influences which analogues appear.",
        ],
      },
      {
        heading: "Honest presentation",
        body: [
          "Good historical work states the data source, the date range, the sample size and the method. XRP Terminal shows these alongside each statistic, serves each series from a single provider rather than silently stitching sources, and repeats the principle that historical results do not guarantee future results.",
        ],
      },
      {
        heading: "Normalised cycle comparison",
        body: [
          "To compare cycles of very different sizes, analysts rebase each one to 100 at a reference point — for example the cycle low or the previous all-time high — and plot days elapsed since that point. This makes shape and duration comparable side by side. The choice of anchor changes the picture, and later cycles have played out in a larger and more institutional market than earlier ones.",
        ],
      },
    ],
    takeaways: [
      "History provides base rates, not forecasts.",
      "Drawdown, recovery time and volatility regimes are the core measurements.",
      "Few cycles means wide uncertainty — check sample sizes.",
      "Analogues show a range of paths, not the path.",
      "Always know the source, window and method.",
    ],
    tools: [
      { href: "/historical", label: "Historical intelligence", description: "Cycles, drawdowns, recoveries and seasonality." },
      { href: "/future", label: "Future scenarios", description: "Scenario ranges built from historical behaviour." },
    ],
  },
  {
    slug: "backtesting",
    number: 11,
    title: "Backtesting",
    summary: "How to test rules on historical data honestly — costs, biases, out-of-sample validation and meaningful metrics.",
    track: "Research",
    level: "Intermediate",
    sections: [
      {
        heading: "What a backtest is",
        body: [
          "A backtest applies precisely defined trading rules to historical data to see how they would have performed. It has four parts: the data, the rules, an execution model (how orders would have filled, with fees and slippage), and the metrics used to judge the result. A weakness in any one part makes the whole result unreliable.",
        ],
      },
      {
        heading: "The biases that flatter results",
        body: ["Most impressive backtests are impressive because of a bias:"],
        bullets: [
          "Lookahead bias — using information that was not available at the time, such as a candle's close before the candle ended.",
          "Overfitting — tuning many parameters until the rules match past noise.",
          "Data snooping — testing hundreds of ideas and reporting only the best one.",
          "Unrealistic execution — assuming fills at exact prices with no fees or slippage.",
          "Survivorship bias — testing only on assets that still exist today.",
        ],
      },
      {
        heading: "Validation",
        body: [
          "Keep part of the data out of sample: design the rules on one period and evaluate them on a later one you did not look at. Walk-forward testing repeats this process through time. Check how sensitive results are to small parameter changes — a robust idea should not collapse when a moving average changes from 50 to 55 periods.",
          "Count the trades. A strategy with a dozen trades tells you very little, however good its returns look.",
        ],
      },
      {
        heading: "Metrics that matter",
        body: ["Judge a strategy on several dimensions, never on return alone:"],
        bullets: [
          "Total return compared with simply buying and holding over the same period.",
          "Maximum drawdown and time spent in drawdown.",
          "Win rate together with the average win and average loss.",
          "Profit factor and expectancy per trade.",
          "Exposure — how much of the time capital was at risk.",
        ],
      },
      {
        heading: "Backtesting in XRP Terminal",
        body: [
          "Strategy Lab computes indicators causally, applies fees and slippage, and compares results with a buy-and-hold benchmark. Its results are simulations on historical data: they show how rules behaved in the past, not how they will behave in future markets.",
        ],
      },
      {
        heading: "Reading the equity curve",
        body: [
          "Look beyond the final number. A curve whose profit comes from two or three enormous trades may depend on luck. Long flat stretches test patience in a way a summary statistic hides. Clusters of losses reveal regime dependence. Compare the worst drawdown with what you could tolerate financially and emotionally — live drawdowns frequently exceed the backtested maximum.",
        ],
      },
    ],
    takeaways: [
      "A backtest is only as good as its data, rules, execution model and metrics.",
      "Lookahead and overfitting are the most common flaws.",
      "Validate out of sample and check parameter sensitivity.",
      "Judge drawdowns and trade count, not just returns.",
      "Always compare with buy-and-hold.",
    ],
    tools: [
      { href: "/trade-lab/strategy", label: "Strategy Lab", description: "Backtest rules with costs (simulated)." },
      { href: "/trade-lab/replay", label: "Historical replay", description: "Step through history without seeing the future." },
    ],
  },
  {
    slug: "paper-trading",
    number: 12,
    title: "Paper trading",
    summary: "Using simulated capital to rehearse process — what it teaches, what it cannot, and how to get the most from it.",
    track: "Practice",
    level: "Beginner",
    sections: [
      {
        heading: "What paper trading is",
        body: [
          "Paper trading means executing a trading plan with virtual money against real market prices. You practise the full process — analysis, entry, sizing, stops, exits and review — without risking capital. It is rehearsal, not proof.",
        ],
      },
      {
        heading: "What it teaches well",
        body: ["Simulation is excellent for building mechanics and habits:"],
        bullets: [
          "Using order types correctly and understanding their fills.",
          "Calculating position size before every trade.",
          "Following written rules consistently.",
          "Recording and reviewing trades in a journal.",
          "Seeing how fees and slippage erode small edges.",
        ],
      },
      {
        heading: "What it cannot reproduce",
        body: [
          "Paper trading does not reproduce every live condition. Emotions are weaker when no real money is at stake, which can make discipline look easier than it is. Fills are modelled, not negotiated with a real order book, so large orders and fast markets may be more favourable in simulation than in reality. Exchange outages, withdrawal limits and counterparty events do not happen in a simulator.",
          "Past simulated performance does not guarantee future results.",
        ],
      },
      {
        heading: "Getting the most from it",
        body: ["Treat simulation as seriously as you would real capital:"],
        bullets: [
          "Use a virtual balance similar to what you would actually use, not an arbitrary large number.",
          "Write your rules before you start and do not change them mid-trade.",
          "Journal every trade, including the reasoning and how you felt.",
          "Review weekly and measure process quality, not just profit.",
          "Resetting an account after a bad run hides the lesson; review before resetting.",
        ],
      },
      {
        heading: "Trade Lab",
        body: [
          "XRP Terminal's Trade Lab starts you with 100,000 USD in virtual capital and uses live market data, with a fee and slippage model applied to every fill. Every Trade Lab screen is labelled SIMULATED: no real orders, deposits or withdrawals ever occur, and nothing is sent to an exchange.",
        ],
      },
      {
        heading: "From simulation to real decisions",
        body: [
          "Months of consistent process in simulation are more informative than one impressive week. If you ever decide to use real capital elsewhere, start far smaller than your simulated size, expect worse fills than the simulator gave you, and keep the same journal and rules. XRP Terminal never executes real trades and does not provide personalised investment advice.",
        ],
      },
    ],
    takeaways: [
      "Paper trading rehearses process with real prices and virtual money.",
      "It builds mechanics and habits, not proof of profitability.",
      "It cannot reproduce emotions, real liquidity or venue risk.",
      "Use realistic balances, fixed rules and a journal.",
      "Simulated results never guarantee live results.",
    ],
    tools: [
      { href: "/trade-lab", label: "Trade Lab", description: "Paper trading with live prices (simulated)." },
      { href: "/trade-lab/performance", label: "Performance", description: "Review your simulated results." },
    ],
  },
  {
    slug: "strategy-design",
    number: 13,
    title: "Strategy design",
    summary: "From hypothesis to precise rules: entries, exits, stops, sizing, filters and invalidation — without curve-fitting.",
    track: "Practice",
    level: "Intermediate",
    sections: [
      {
        heading: "Start with a hypothesis",
        body: [
          "A strategy should begin with a reason to expect an edge — for example, \"trends in XRP tend to persist for weeks after a breakout\" — rather than with a search through indicator combinations. A clear hypothesis tells you what to test and what result would show you are wrong.",
        ],
      },
      {
        heading: "Make every rule precise",
        body: ["A complete strategy specifies, without ambiguity:"],
        bullets: [
          "Market and timeframe — which pair, which candles, which session boundaries.",
          "Entry — the exact condition, evaluated on closed candles.",
          "Exit — targets, trailing rules or time-based exits.",
          "Stop — where the idea is wrong and the position must close.",
          "Sizing — how much to risk per trade.",
          "Filters — conditions when the strategy should not trade, such as a volatile regime.",
        ],
      },
      {
        heading: "An educational example",
        body: [
          "The following is a template for learning the structure, not a recommendation: go long when the daily close is above the 50-day SMA and the 20-day SMA is above the 50-day; exit when the close falls below the 50-day SMA; place an initial stop two ATRs below entry; risk 1% of equity per trade. Each part is testable, and each part can fail.",
        ],
      },
      {
        heading: "Resist curve-fitting",
        body: [
          "Every additional rule and parameter makes it easier to fit the past and harder to succeed in the future. Prefer few, simple rules with a clear rationale. Decide your evaluation criteria — minimum number of trades, acceptable drawdown, benchmark comparison — before you look at results, so you cannot move the goalposts afterwards.",
        ],
      },
      {
        heading: "Version and invalidate",
        body: [
          "Treat a strategy like software: give each change a version and record why it was made. Also write down in advance what would make you stop using it, such as a drawdown beyond anything seen in testing. A strategy without an invalidation rule tends to be abandoned at the worst moment or kept long after it stopped working.",
        ],
      },
      {
        heading: "A testing sequence",
        body: ["Move an idea through increasingly demanding stages, stopping as soon as it fails one:"],
        bullets: [
          "Write the hypothesis and the precise rules.",
          "Backtest on in-sample data with fees and slippage.",
          "Validate on out-of-sample data you have not looked at.",
          "Replay history bar by bar to see how the signals feel in real time.",
          "Paper trade forward for a meaningful number of trades.",
          "Review against the criteria you set before starting.",
        ],
      },
    ],
    takeaways: [
      "Begin with a hypothesis, not an indicator search.",
      "Define entry, exit, stop, sizing and filters precisely.",
      "Fewer rules generalise better.",
      "Set evaluation criteria before seeing results.",
      "Version every change and define invalidation in advance.",
    ],
    tools: [
      { href: "/trade-lab/strategy", label: "Strategy Lab", description: "Condition builder and backtests (simulated)." },
      { href: "/calculators#position-size", label: "Position sizing", description: "Size trades from your stop." },
    ],
  },
  {
    slug: "trading-journal",
    number: 14,
    title: "Trading journal",
    summary: "What to record, how to measure results in R-multiples, and how a weekly review turns experience into skill.",
    track: "Practice",
    level: "Beginner",
    sections: [
      {
        heading: "Why keep a journal",
        body: [
          "Memory is unreliable. After the fact, we remember our reasoning as better than it was (hindsight bias) and credit wins to skill and losses to bad luck. A journal records decisions at the time they are made, creating an honest feedback loop.",
        ],
      },
      {
        heading: "What to record",
        body: ["For every trade, capture:"],
        bullets: [
          "Date, time, instrument and direction.",
          "Planned entry, stop and target, and the actual fills.",
          "Position size and the amount at risk.",
          "The setup and the reasoning in one or two sentences.",
          "Market context — for example the regime or a relevant event.",
          "Your state of mind: calm, rushed, fearful, overconfident.",
          "The outcome, mistakes made and one lesson.",
        ],
      },
      {
        heading: "Measuring in R",
        body: [
          "An R-multiple expresses a result relative to the initial risk. If you risked 100 and made 250, the trade was +2.5R; if you lost 100, it was −1R; if slippage made the loss 130, it was −1.3R. Measuring in R makes trades of different sizes comparable and immediately shows whether losses are staying within plan.",
          "Expectancy — the average R per trade — combines win rate and payoff into a single number. It is only meaningful with enough trades.",
        ],
      },
      {
        heading: "The weekly review",
        body: ["Set a fixed time each week to review:"],
        bullets: [
          "Which setups performed best and worst, measured in R?",
          "Were rules followed? Separate process errors from normal losses.",
          "Are losses larger than −1R? Why?",
          "Which tags or emotions correlate with mistakes?",
          "Did you skip valid setups because of fear after a loss? Missed trades are data too.",
          "What single change will you make next week?",
        ],
      },
      {
        heading: "Process over outcome",
        body: [
          "A well-executed trade can lose money, and a reckless trade can win. Over many trades, good process tends to matter more than any individual result. Grade each trade on whether you followed your plan, independent of profit or loss.",
        ],
      },
      {
        heading: "Tags that make reviews useful",
        body: [
          "Consistent tags turn a diary into data. Use a small, fixed vocabulary for setups (breakout, pullback, range), for context (trending, ranging, high volatility) and for mistakes (late entry, moved stop, oversized). Filtering by tag then shows, for example, whether most of your worst losses come from one habit. Too many tags make every group too small to learn from.",
        ],
      },
    ],
    takeaways: [
      "Journals counter hindsight and self-serving bias.",
      "Record plan, execution, context and emotion.",
      "Measure results in R-multiples.",
      "Review weekly and change one thing at a time.",
      "Grade process separately from outcome.",
    ],
    tools: [
      { href: "/trade-lab/journal", label: "Trade Lab journal", description: "Tag, search and review simulated trades." },
      { href: "/trade-lab/performance", label: "Performance", description: "R-multiples and trade statistics." },
    ],
  },
  {
    slug: "common-mistakes",
    number: 15,
    title: "Common mistakes",
    summary: "The recurring errors — behavioural, analytical and security-related — that cost market participants the most.",
    track: "Practice",
    level: "Beginner",
    sections: [
      {
        heading: "Behavioural mistakes",
        body: ["Most losses start with behaviour rather than analysis:"],
        bullets: [
          "Trading without a written plan, so every decision is improvised.",
          "Oversizing after a win, or to \"make back\" a loss (revenge trading).",
          "Moving a stop further away because the trade went against you.",
          "Chasing a move after it has already happened out of fear of missing out.",
          "Overtrading — fees and slippage quietly consume small edges.",
        ],
      },
      {
        heading: "Analytical mistakes",
        body: ["Common errors in research:"],
        bullets: [
          "Confirmation bias — seeking only evidence that supports the existing view.",
          "Treating scenarios or targets as predictions.",
          "Trusting backtests that ignore costs or use future data.",
          "Reading every large on-chain transfer as a sale.",
          "Drawing strong conclusions from very small samples.",
          "Ignoring data freshness — acting on a stale price.",
        ],
      },
      {
        heading: "Information mistakes",
        body: [
          "Social media amplifies confident claims regardless of accuracy. Screenshots of profits can be fabricated, and accounts can impersonate well-known people. Check whether claims have primary sources, whether performance is independently verified, and whether the person has an undisclosed interest in what they promote. XRP Terminal labels information as verified, unverified, simulated or external so the difference is visible.",
        ],
      },
      {
        heading: "Security mistakes",
        body: ["These are often irreversible:"],
        bullets: [
          "Sharing a seed phrase or private key — with anyone, for any reason.",
          "Falling for \"send XRP and receive double back\" giveaways; they are always scams.",
          "Trusting \"support staff\" who contact you first through direct messages.",
          "Omitting a destination tag when depositing to an exchange.",
          "Entering credentials on look-alike websites.",
          "Granting trading or withdrawal permissions to tools that only need read access.",
        ],
      },
      {
        heading: "Turning mistakes into rules",
        body: [
          "Each mistake you catch in your journal can become a rule: a maximum risk per trade, a cooling-off period after two losses, a checklist before every transfer. Rules made in calm moments protect you in stressful ones. None of this guarantees profits — it makes avoidable losses less likely.",
        ],
      },
      {
        heading: "Record-keeping and tax",
        body: [
          "In many jurisdictions, selling crypto-assets or exchanging one for another can be a taxable event. Without records of acquisition dates, costs and disposals, compliance becomes difficult later. Rules differ by country and change over time, so consult a qualified tax adviser. Portfolio tools can help organise your records, but they are not tax advice.",
        ],
      },
    ],
    takeaways: [
      "Write a plan and size small; never move stops to avoid a loss.",
      "Treat scenarios as ranges, not promises.",
      "Verify claims and performance before trusting them.",
      "Never share keys or seed phrases; giveaways are scams.",
      "Turn each recorded mistake into a written rule.",
    ],
    tools: [
      { href: "/news/claim-check", label: "Claim Check", description: "Check a claim against sources." },
      { href: "/trade-lab/journal", label: "Journal", description: "Record and learn from mistakes (simulated)." },
      { href: "/security", label: "Security", description: "How XRP Terminal protects you." },
    ],
  },
];

export function getAcademyModule(slug: string): AcademyModule | undefined {
  return ACADEMY_MODULES.find((m) => m.slug === slug);
}

/** Word count over all visible prose (for reading-time estimates and tests). */
export function moduleWordCount(m: AcademyModule): number {
  const text = [
    m.summary,
    ...m.sections.flatMap((s) => [s.heading, ...s.body, ...(s.bullets ?? [])]),
    ...m.takeaways,
  ].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

export function readingMinutes(m: AcademyModule): number {
  return Math.max(2, Math.round(moduleWordCount(m) / 200));
}
