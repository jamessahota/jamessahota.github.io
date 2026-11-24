(function () {
  "use strict";

  // Historical scenarios: ten real trading days each.
  //
  // PRICES are real. They are the U.S. Energy Information Administration's daily
  // series for the Cushing, Oklahoma WTI spot price and for NYMEX light sweet crude
  // futures contracts 1 to 4 (settlement prices, dollars per barrel), read from
  // https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm and
  // https://www.eia.gov/dnav/pet/pet_pri_fut_s1_d.htm in November 2026.
  // Each row is [spot, contract 1, contract 2, contract 3, contract 4]. The first
  // row is the close before the first day, and the other ten are the days played.
  //
  // The NEWS for each day was researched from public sources and checked twice.
  // A ticket trades at the previous close, so "known" holds only what was public at
  // that close, plus what was scheduled. Anything that came out later, including over
  // a weekend, belongs in that day's "happened", along with the day itself.
  //
  // Everything else is the game's own and is not historical: the bids and offers
  // around spot, the clients, the storage rates and the counterparties.

  const cents = (rows) => rows.map(row => row.map(value => Math.round(value * 100)));

  const scenarios = [
    {
      key: "apr2020",
      title: "The day oil went negative",
      period: "13 to 24 April 2020",
      summary: "Lockdowns have wiped out demand and Cushing is filling up. The May contract expires on day seven.",
      dates: ["2020-04-09", "2020-04-13", "2020-04-14", "2020-04-15", "2020-04-16", "2020-04-17", "2020-04-20", "2020-04-21", "2020-04-22", "2020-04-23", "2020-04-24"],
      months: ["May", "Jun", "Jul", "Aug", "Sep"],
      // The May contract's last trading day was 21 April, the seventh day played.
      expiry: 7,
      // September only becomes the fourth listed month the next day, and the source has no price
      // for it on 21 April. This one is August's settlement plus the next day's August-to-September gap.
      afterExpiry: { price: 2362, estimated: true },
      prices: cents([
        [22.90, 22.76, 28.82, 32.00, 33.12],
        [22.36, 22.41, 29.26, 32.96, 34.42],
        [20.15, 20.11, 27.40, 31.87, 33.65],
        [19.96, 19.87, 26.04, 29.96, 31.49],
        [19.82, 19.87, 25.53, 29.55, 31.09],
        [18.31, 18.27, 25.03, 29.42, 31.20],
        [-36.98, -37.63, 20.43, 26.28, 28.51],
        [8.91, 10.01, 11.57, 18.69, 21.61],
        [13.64, 13.78, 20.69, 23.76, 25.77],
        [15.06, 16.50, 21.44, 24.12, 25.89],
        [15.99, 16.94, 21.22, 23.86, 25.71],
      ]),
      // Storage is what everyone wants: clients queue for space, overflow is dear and sellers are desperate.
      terminal: { clientTight: 85, clientLoose: 70, rateScale: 2.5, storageScale: 4, events: ["surplus", "surplus", "surplus", "maintenance", "pipeline"] },
      intro: "Lockdowns have cut world fuel use by roughly 30%, and crude is piling up in storage, including at Cushing. May WTI settled at $22.76 on Thursday 9 April, about $6 below June. US markets were closed on Good Friday.",
      note: "Most of this result comes from one ticket. On 21 April the hedge had to move out of May, at −$37.63, and into June, at $20.43. That gap of $58 a barrel is what storage at Cushing was worth that day.",
      days: [
        { known: "OPEC+ ministers are trying to agree a record output cut. World fuel use is down roughly 30%, and storage is filling.",
          happened: "On Sunday OPEC+ agreed to cut 9.7 million barrels a day from 1 May, after Mexico held up the deal for days. Goldman Sachs called it historic yet insufficient. WTI settled at $22.41, down 35 cents." },
        { known: "OPEC+ will cut 9.7 million barrels a day from 1 May. The May contract’s discount to June is the widest since 2009, a sign that traders expect Cushing to fill.",
          happened: "WTI fell about 10% to settle at $20.11 as traders focused on oversupply. The Energy Department said it was negotiating with nine companies to store about 23 million barrels in the Strategic Petroleum Reserve." },
        { known: "WTI is near $20. The weekly EIA stocks report is due tomorrow. Last week’s build of 15.2 million barrels was a record.",
          happened: "The IEA forecast April demand 29 million barrels a day below a year earlier. EIA reported a 19.2 million barrel rise in US crude stocks, the largest weekly build on record. WTI settled at $19.87, its lowest close since February 2002." },
        { known: "WTI is below $20 after a record stock build. OPEC’s monthly report is due tomorrow, and President Trump is expected to set out guidelines for reopening the US economy.",
          happened: "OPEC forecast that world oil demand would fall by 6.9 million barrels a day in 2020. ConocoPhillips said it would cut about 225,000 barrels a day of US and Canadian output. WTI settled unchanged at $19.87." },
        { known: "The May contract expires on Tuesday 21 April, and trading is moving to June. Producers have begun to announce output cuts.",
          happened: "May WTI fell 8% to settle at $18.27 as holders rolled into June, which settled at $25.03. Government data showed Cushing 69% full, up from 49% four weeks earlier. Baker Hughes counted 66 fewer US oil rigs." },
        { known: "The May contract expires on Tuesday. June settled $6.76 above it today. Anyone still holding May at expiry must take delivery at Cushing, where tanks are filling fast.",
          happened: "With few buyers able to take delivery, the May contract fell $55.90 to settle at −$37.63, the first negative settlement on record, after trading as low as −$40.32. June settled at $20.43." },
        { known: "May settled at −$37.63 today and expires tomorrow. June is $58 higher, at $20.43. A negative price means sellers are paying to be rid of crude they cannot store.",
          happened: "The May contract expired at $10.01. June fell 43% to $11.57 on record volume. President Trump said he had ordered a plan to make funds available to the oil industry. Texas regulators delayed a vote on output limits." },
        { known: "June is now the front contract, after falling 43% in a day. The weekly EIA stocks report is due tomorrow. Texas regulators have put off a vote on output limits.",
          happened: "June WTI rose 19% to settle at $13.78. EIA reported US crude stocks up 15 million barrels, with Cushing at almost 60 million. Saudi Arabia said it was ready to take extra measures with other producers." },
        { known: "WTI has rebounded, but US crude stocks are near their 2017 record. Oklahoma’s regulator has said producers can shut wells without losing their leases.",
          happened: "WTI rose about 20% to settle at $16.50 on signs that producers were cutting output. Kuwait said it had begun reducing supply ahead of the 1 May start of the OPEC+ deal." },
        { known: "Producers are cutting output, and the OPEC+ cuts start in a week. Baker Hughes’ weekly rig count is due tomorrow.",
          happened: "Reuters reported that Continental Resources had shut in most of its North Dakota output. Baker Hughes counted 378 US oil rigs, down 60, the lowest since July 2016. WTI rose 44 cents to settle at $16.94." },
      ],
      aftermath: "OPEC+ cuts took effect on 1 May and US producers shut in wells. Cushing reached 83% of capacity in the week to 1 May, then fell to 58% by 19 June. WTI closed above $30 on 18 May, and the June contract expired on 19 May at $32.50.",
    },
    {
      key: "mar2020",
      title: "The price war",
      period: "2 to 13 March 2020",
      summary: "Producers meet in Vienna to answer a demand shock. The talks matter more than anyone expects.",
      dates: ["2020-02-28", "2020-03-02", "2020-03-03", "2020-03-04", "2020-03-05", "2020-03-06", "2020-03-09", "2020-03-10", "2020-03-11", "2020-03-12", "2020-03-13"],
      months: ["Apr", "May", "Jun", "Jul"],
      expiry: null,
      prices: cents([
        [44.83, 44.76, 44.94, 45.10, 45.23],
        [46.78, 46.75, 46.92, 47.05, 47.14],
        [47.27, 47.18, 47.33, 47.45, 47.52],
        [46.78, 46.78, 46.95, 47.11, 47.22],
        [45.90, 45.90, 46.06, 46.21, 46.34],
        [41.14, 41.28, 41.51, 41.77, 42.04],
        [31.05, 31.13, 31.47, 31.94, 32.46],
        [34.47, 34.36, 34.73, 35.14, 35.58],
        [33.13, 32.98, 33.39, 33.86, 34.39],
        [31.56, 31.50, 31.98, 32.51, 33.11],
        [31.72, 31.73, 32.11, 32.59, 33.15],
      ]),
      terminal: { clientTight: 60, clientLoose: 45, rateScale: 1.3, storageScale: 1.5, events: ["surplus", "surplus", "firm", "pipeline", "maintenance"] },
      intro: "WTI closed at $44.76 on Friday 28 February after falling about 16% in a week, its largest weekly fall since December 2008, as the coronavirus spread outside China. OPEC+ is withholding about 1.7 million barrels a day under a deal that expires at the end of March, and meets in Vienna on 5 and 6 March.",
      note: "",
      days: [
        { known: "WTI fell about 16% this week, its largest weekly drop since December 2008. OPEC+ meets in Vienna on Thursday and Friday.",
          happened: "Data showed Chinese factory activity shrank at a record pace in February. WTI rose about 4.5% to settle at $46.75, its first gain in seven sessions, on hopes of deeper OPEC+ cuts and central bank support." },
        { known: "WTI has rebounded. Russia’s energy minister says Moscow has not received a proposal for deeper cuts. An OPEC+ technical committee meets in Vienna tomorrow, ahead of the ministers.",
          happened: "The Federal Reserve made an emergency half-point rate cut. WTI rose briefly, then settled at $47.18. An OPEC+ technical panel recommended an extra second-quarter cut of 600,000 to 1 million barrels a day." },
        { known: "The Fed’s emergency cut gave oil only brief support. An OPEC+ technical panel has recommended extra cuts of up to 1 million barrels a day. The weekly EIA stocks report is due tomorrow.",
          happened: "An OPEC+ ministerial panel in Vienna failed to agree on new cuts, and Russia’s energy minister left for consultations in Moscow. EIA reported a crude stock build of about 0.8 million barrels. WTI settled at $46.78." },
        { known: "Saudi Arabia wants extra cuts of 1 to 1.5 million barrels a day. Russia has so far backed only extending the existing cuts. OPEC ministers meet tomorrow, and the wider group, including Russia, on Friday.",
          happened: "OPEC ministers backed an extra cut of 1.5 million barrels a day, on condition that Russia and other allies joined. Russia’s finance minister said no deal had been reached and Moscow was ready for lower prices. WTI settled at $45.90." },
        { known: "OPEC wants an extra cut of 1.5 million barrels a day but needs Russia to join. The full OPEC+ meeting is in Vienna tomorrow.",
          happened: "The OPEC+ meeting ended with no deal. Russia’s energy minister said producers would be free of quotas from 1 April. WTI fell about 10% to settle at $41.28, its largest one-day fall since November 2014." },
        { known: "The OPEC+ talks have collapsed, and Russia says producers will be free of quotas from 1 April. Saudi Arabia has not yet said how it will respond.",
          happened: "On Saturday Saudi Aramco cut its April prices by $6 to $8 a barrel, and on Sunday Reuters reported Saudi plans to pump above 10 million barrels a day. WTI fell 24.6% to settle at $31.13, its largest one-day fall since January 1991." },
        { known: "WTI has had its largest one-day fall since 1991. The IEA now expects world oil demand to contract in 2020 for the first time since 2009. President Trump has promised major steps to support the US economy.",
          happened: "Saudi Aramco said it would supply 12.3 million barrels a day in April, up from about 9.7 million. WTI still rose about 10% to settle at $34.36, on hopes of US stimulus and as shale producers cut spending." },
        { known: "Saudi Aramco plans to supply 12.3 million barrels a day in April. Russia’s energy minister has not ruled out joint measures with OPEC. The weekly EIA stocks report is due tomorrow.",
          happened: "The WHO said the outbreak was a pandemic. EIA reported a 7.7 million barrel rise in US crude stocks, and the UAE’s ADNOC said it would supply more than 4 million barrels a day in April. WTI settled at $32.98." },
        { known: "The WHO has declared a pandemic. Saudi Arabia and the UAE plan to raise supply in April. The European Central Bank meets tomorrow.",
          happened: "On Wednesday night President Trump announced a 30-day ban on travel from most of Europe. WTI fell about 4.5% to settle at $31.50, and US stocks had their largest one-day fall since 1987." },
        { known: "US stocks have had their largest one-day fall since 1987. Saudi Arabia and the UAE are offering more crude, and an OPEC+ technical meeting planned for 18 March is unlikely to go ahead.",
          happened: "WTI rose 0.7% to settle at $31.73, down about 23% on the week, its largest weekly fall since 2008. After settlement, President Trump declared a national emergency and said the US would buy crude for the Strategic Petroleum Reserve." },
      ],
      aftermath: "WTI kept falling, including a 24% one-day drop on 18 March. On 12 April OPEC+ agreed to cut output by 9.7 million barrels a day for May and June. On 20 April, with storage at Cushing scarce, the expiring May contract traded below zero for the first time.",
    },
    {
      key: "ukraine2022",
      title: "Russia invades Ukraine",
      period: "24 February to 9 March 2022",
      summary: "A tight market loses its nerve over Russian supply. Prompt barrels are worth far more than later ones.",
      dates: ["2022-02-23", "2022-02-24", "2022-02-25", "2022-02-28", "2022-03-01", "2022-03-02", "2022-03-03", "2022-03-04", "2022-03-07", "2022-03-08", "2022-03-09"],
      months: ["Apr", "May", "Jun", "Jul"],
      expiry: null,
      prices: cents([
        [92.14, 92.10, 90.69, 89.08, 87.56],
        [92.77, 92.81, 90.94, 88.84, 86.99],
        [91.68, 91.59, 89.89, 87.93, 86.19],
        [96.13, 95.72, 93.50, 90.98, 88.72],
        [103.66, 103.41, 100.21, 96.24, 92.64],
        [110.74, 110.60, 107.06, 102.37, 97.58],
        [107.69, 107.67, 104.61, 100.74, 96.78],
        [115.77, 115.68, 112.11, 108.12, 104.18],
        [119.26, 119.40, 115.80, 111.71, 107.72],
        [123.64, 123.70, 119.65, 115.21, 110.83],
        [108.81, 108.70, 105.05, 100.95, 97.26],
      ]),
      // Nobody pays to store oil when prompt barrels are the dearest on the curve.
      terminal: { clientTight: 30, clientLoose: 15, rateScale: 0.8, storageScale: 1, events: ["refinery", "refinery", "firm", "firm", "pipeline"] },
      intro: "Earlier in the week Russia sent troops into two breakaway regions of eastern Ukraine. The US, EU, Britain and others sanctioned Russian banks and individuals, and Germany halted the Nord Stream 2 pipeline, but oil and gas flows were not targeted. WTI closed at $92.10 on 23 February.",
      note: "",
      days: [
        { known: "Russian troops are in eastern Ukraine, and the first sanctions have left oil and gas flows alone. Talks to revive the Iran nuclear deal are advancing. The weekly EIA stocks report is due tomorrow.",
          happened: "Russia invaded Ukraine before US trading began. WTI briefly traded above $100, then settled at $92.81 after President Biden announced bank sanctions designed to let energy payments continue." },
        { known: "Russia has invaded Ukraine. US sanctions hit Russian banks but let energy payments continue, and SWIFT was left out. President Biden says consuming countries are working on a coordinated release of reserves.",
          happened: "WTI rose to about $95.64 early, then fell to settle at $91.59 as a US official said sanctions would not target Russian oil and gas flows. Some buyers of Russian oil reportedly struggled to get bank guarantees and ships." },
        { known: "Sanctions so far avoid Russian oil and gas, but some buyers are struggling to get bank guarantees and ships for Russian cargoes.",
          happened: "Over the weekend the US, Europe and Canada agreed to cut selected Russian banks from SWIFT, and BP said it would exit its Rosneft stake. Canada banned Russian oil imports. WTI settled at $95.72, up about 4.5%." },
        { known: "Selected Russian banks are being cut from SWIFT, and BP is leaving its Russian venture. Consuming countries are discussing an emergency stock release. OPEC+ meets on Wednesday.",
          happened: "IEA member countries agreed to release 60 million barrels from emergency stocks, about half of it from the US. Traders judged it too small, and WTI rose about 8% to settle at $103.41, its first settlement above $100 since 2014." },
        { known: "WTI is above $100. OPEC+ is expected to keep its monthly increase of 400,000 barrels a day at tomorrow’s meeting. The weekly EIA stocks report is due.",
          happened: "OPEC+ kept its increase of 400,000 barrels a day for April. EIA reported US crude stocks down 2.6 million barrels, with Cushing down about 1 million to 22.8 million. WTI settled at $110.60." },
        { known: "OPEC+ has declined to add extra supply. At least ten tankers of Russian oil have reportedly failed to find buyers. Talks to revive the Iran nuclear deal continue in Vienna.",
          happened: "WTI reached about $116.57, its highest since September 2008, then fell to settle at $107.67. Reports of fast progress towards an Iran nuclear deal, which could return Iranian oil to the market, were cited." },
        { known: "WTI has pulled back from its highest since 2008 on hopes of an Iran nuclear deal. Russian crude is struggling to find buyers.",
          happened: "Russian forces seized the Zaporizhzhia nuclear plant overnight. The White House said it was weighing cuts to US imports of Russian oil. WTI settled at $115.68, its highest close since September 2008, up about 26% on the week." },
        { known: "The White House is weighing cuts to US imports of Russian oil. The head of the UN nuclear agency is due in Tehran on Saturday as the Iran talks near a decision.",
          happened: "On Sunday Secretary of State Blinken said the US and European allies were exploring a ban on Russian oil imports. WTI hit $130.50 as trading opened, then settled at $119.40 after Germany’s Chancellor Scholz rejected an embargo on Russian energy." },
        { known: "Germany has rejected an embargo on Russian energy. US officials say Washington is willing to ban Russian oil imports without its European allies, but no decision has been announced.",
          happened: "President Biden announced a ban on US imports of Russian oil, LNG and coal. Britain said it would phase out Russian oil imports by the end of 2022, and Shell said it would stop buying Russian crude. WTI settled at $123.70." },
        { known: "The US has banned Russian oil imports, and Britain plans a phase-out. WTI has settled at its highest since 2008. The weekly EIA stocks report is due tomorrow.",
          happened: "The head of the IEA said more emergency oil could be released. Then the UAE’s ambassador in Washington said the UAE favoured production increases and would encourage OPEC to consider them. WTI fell about 12% to settle at $108.70." },
      ],
      aftermath: "On 10 March the UAE’s energy minister said the country remained committed to the existing OPEC+ plan. WTI settled below $100 on 15 March, amid Covid curbs in China and talks between Russia and Ukraine. On 31 March President Biden announced a release of about 1 million barrels a day from the Strategic Petroleum Reserve for six months.",
    },
    {
      key: "abqaiq2019",
      title: "The attack on Abqaiq",
      period: "9 to 20 September 2019",
      summary: "A quiet, well-supplied market. Then a weekend changes Monday’s opening price.",
      dates: ["2019-09-06", "2019-09-09", "2019-09-10", "2019-09-11", "2019-09-12", "2019-09-13", "2019-09-16", "2019-09-17", "2019-09-18", "2019-09-19", "2019-09-20"],
      months: ["Oct", "Nov", "Dec", "Jan"],
      // The October contract's last trading day was 20 September, the final day, when the run closes anyway.
      expiry: null,
      prices: cents([
        [56.45, 56.52, 56.43, 56.17, 55.82],
        [57.88, 57.85, 57.73, 57.43, 57.03],
        [57.37, 57.40, 57.29, 57.00, 56.60],
        [55.66, 55.75, 55.67, 55.44, 55.12],
        [55.13, 55.09, 55.05, 54.86, 54.57],
        [54.76, 54.85, 54.80, 54.59, 54.27],
        [63.10, 62.90, 62.67, 62.02, 61.13],
        [59.26, 59.34, 59.10, 58.57, 57.92],
        [58.19, 58.11, 58.04, 57.62, 57.08],
        [58.19, 58.13, 58.19, 57.91, 57.43],
        [57.92, 58.09, 58.09, 57.84, 57.39],
      ]),
      terminal: {},
      intro: "WTI closed at $56.52 on Friday 6 September, up 2.6% on the week. OPEC and allies including Russia are holding output cuts of 1.2 million barrels a day, while the US-China trade dispute and forecasts of slower demand growth weigh on prices.",
      note: "",
      days: [
        { known: "OPEC+ is holding cuts of 1.2 million barrels a day. An OPEC+ monitoring committee meets in Abu Dhabi on Thursday 12 September.",
          happened: "Saudi Arabia named Prince Abdulaziz bin Salman energy minister on Sunday. He said the kingdom’s oil policy would not change and the OPEC+ cut would stay in place. WTI rose $1.33 to settle at $57.85." },
        { known: "The new Saudi energy minister has backed the existing OPEC+ cuts. A Reuters poll points to a fourth straight weekly fall in US crude stocks.",
          happened: "WTI fell 45 cents to settle at $57.40. President Trump fired national security adviser John Bolton, which traders saw as raising the chance of Iranian oil returning. The EIA cut its 2019 price forecasts." },
        { known: "Traders are weighing what Bolton’s exit means for Iran sanctions. The weekly EIA stocks report and OPEC’s monthly report are due tomorrow.",
          happened: "WTI fell $1.65 to settle at $55.75 after a report that Trump had discussed easing Iran sanctions. That outweighed EIA data showing a 6.9 million barrel crude draw. OPEC trimmed its 2020 demand growth forecast." },
        { known: "WTI has fallen for two sessions. The OPEC+ monitoring committee meets in Abu Dhabi tomorrow, with attention on over-production by Iraq and Nigeria.",
          happened: "WTI fell 66 cents to settle at $55.09. The OPEC+ committee deferred any decision on deeper cuts to December, and the IEA warned of a surplus in 2020." },
        { known: "WTI has fallen three days running. OPEC+ has put off any decision on deeper cuts until December, and both OPEC and the IEA have flagged a possible surplus in 2020.",
          happened: "WTI fell 24 cents to settle at $54.85, a weekly loss of about 3%. Worries about slower global growth outweighed signs of progress in the US-China trade dispute. Baker Hughes reported US oil rigs down five to 733." },
        { known: "WTI is at $54.85 after four falls in a row. A surplus is forecast for 2020, and OPEC+ will not decide on deeper cuts until December.",
          happened: "On Saturday, attacks on Aramco’s Abqaiq plant and Khurais field halted about 5.7 million barrels a day, about half of Saudi output. WTI settled at $62.90, up about 14.7%, its largest one-day gain since December 2008 according to Reuters." },
        { known: "Aramco has given no timeline for recovery, and sources have told Reuters a full return could take months. President Trump has authorised a release from the Strategic Petroleum Reserve if needed.",
          happened: "WTI fell $3.56 to settle at $59.34. The Saudi energy minister said customer supplies had been restored from stocks and lost output would return by the end of September." },
        { known: "Saudi Arabia says lost output will be back by the end of September. Due tomorrow: the weekly EIA stocks report, a Federal Reserve rate decision and a Saudi presentation of evidence on the attack.",
          happened: "WTI fell $1.23 to settle at $58.11. EIA data showed US crude stocks up 1.1 million barrels, the Federal Reserve cut interest rates, and Trump said he had ordered a substantial increase in sanctions on Iran." },
        { known: "President Trump has ordered more sanctions on Iran, and Secretary of State Pompeo has called the attack an act of war. Traders are watching whether the Saudi recovery timetable holds.",
          happened: "The October contract settled at $58.13, up 2 cents. The Wall Street Journal reported that Saudi Arabia had asked Iraq for up to 20 million barrels, and Iraq’s state oil marketer denied it." },
        { known: "The October contract expires at tomorrow’s close. New US sanctions on Iran are expected, and US-China trade talks are under way in Washington.",
          happened: "The October contract expired at $58.09, down 4 cents, for a weekly gain of about 5.9%. The US Treasury sanctioned Iran’s central bank." },
      ],
      aftermath: "Saudi Arabia’s energy minister said on 3 October that output was fully restored. WTI gave up its gains: it settled at $54.07 on 30 September, below its close of $54.85 before the attack, and at $52.81 on 4 October.",
    },
  ];

  if (typeof module !== "undefined" && module.exports) module.exports = scenarios;
  else window.CargoScenarios = scenarios;
})();
