import React, { useState, useMemo, useEffect, useRef } from "react";

// Flask backend URL (AIFP Python model). MAIM posts strike-modified compute
// timelines and receives the resulting software-progress curve per scenario.
// Auto-switches: localhost dev hits local Flask; public deploy hits Render.
const AIFP_BACKEND_URL = (() => {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://127.0.0.1:5328/api/maim-trajectory";
    }
  }
  return "https://aifp-backend.onrender.com/api/maim-trajectory";
})();

// Build a log-space interpolator from a backend trajectory, keyed on time.
function makeLogInterp(tArr, valArr) {
  const logV = valArr.map(v => Math.log10(Math.max(v, 1e-30)));
  return (t) => {
    if (t <= tArr[0]) return Math.pow(10, logV[0]);
    if (t >= tArr[tArr.length - 1]) return Math.pow(10, logV[logV.length - 1]);
    let lo = 0, hi = tArr.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (tArr[mid] <= t) lo = mid; else hi = mid;
    }
    const frac = (t - tArr[lo]) / (tArr[hi] - tArr[lo]);
    return Math.pow(10, logV[lo] + frac * (logV[hi] - logV[lo]));
  };
}

function makeLinInterp(tArr, valArr) {
  return (t) => {
    if (t <= tArr[0]) return valArr[0];
    if (t >= tArr[tArr.length - 1]) return valArr[valArr.length - 1];
    let lo = 0, hi = tArr.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (tArr[mid] <= t) lo = mid; else hi = mid;
    }
    const frac = (t - tArr[lo]) / (tArr[hi] - tArr[lo]);
    return valArr[lo] + frac * (valArr[hi] - valArr[lo]);
  };
}

// [country, gpus (H100-eq), singleCluster(1/0/-1), name, year, status E/P, chainId]
// chainId links phases of the SAME physical site via explicit Builds Upon links.
// -1 = standalone. Anonymized entries are always standalone.
// Overseas clusters explicitly owned (or jointly owned) by U.S. companies are
// classified as "US" — they count for both U.S.-bloc algorithmic progress and
// as strike targets China would have to eliminate, even if not on U.S. soil.
// Includes: NVIDIA Israel-1, Microsoft Azure Sweden/Netherlands, OpenAI Stargate
// UAE, Amazon UAE (Falcon paper), and JVs SK+AWS Ulsan, G42+Microsoft UAE.
// The Abu Dhabi UAE/USA 5GW Campus Phase 2 entry stays Ally — it's a power-only
// estimate and likely double-counts the Stargate UAE entries on the same site.
// >= 1000 H100-eq only.
const RAW = [
// === US (193 entries; includes 12 U.S.-owned/JV overseas clusters) ===
["US",5191509,-1,"Microsoft Fairwater Wisconsin Phase 4",2027.71,"P",1],
["US",5103588,-1,"Meta Louisiana Datacenter",2030.5,"P",-1],
["US",4163719,-1,"OpenAI Stargate Shackelford Phase 2",2029.03,"P",3],
["US",4152951,-1,"Meta Hyperion",2028.0,"P",-1],
["US",3518580,-1,"QTS Cedar Rapids Phase 2",2027.87,"P",4],
["US",3154582,-1,"Microsoft Fairwater Wisconsin Phase 3",2027.37,"P",1],
["US",1657837,-1,"Goodnight Phase 3",2027.75,"P",5],
["US",1480546,-1,"Crusoe Abilene Expansion Phase 2",2027.86,"P",7],
["US",1389591,-1,"xAI Colossus 2 Phase 3",2026.37,"P",8],
["US",1171298,-1,"Meta Prometheus Phase 7",2026.75,"P",9],
["US",1121779,-1,"Google Cedar Rapids Phase 6",2028.88,"P",10],
["US",1117655,-1,"Microsoft Fairwater Wisconsin Phase 2",2027.09,"P",1],
["US",1020718,-1,"OpenAI Stargate Abilene Phase 4",2026.5,"P",11],
["US",986732,-1,"QTS Cedar Rapids Phase 1",2026.87,"P",4],
["US",969820,-1,"Meta Prometheus Phase 6",2026.65,"P",9],
["US",789296,-1,"Meta Prometheus Phase 5",2026.38,"P",9],
["US",771653,-1,"Anthropic-Amazon New Carlisle Phase 4",2026.47,"P",12],
["US",741313,-1,"Microsoft Fairwater Atlanta Phase 2",2026.37,"P",13],
["US",737746,-1,"Crusoe Abilene Expansion Phase 1",2027.71,"P",7],
["US",685914,-1,"Anthropic-Amazon New Carlisle Phase 3",2026.23,"P",12],
["US",682163,-1,"Google Cedar Rapids Phase 5",2028.39,"P",10],
["US",638207,-1,"Coreweave Helios Phase 3",2029.0,"P",14],
["US",633151,-1,"Amazon Ridgeland Phase 2",2027.72,"P",15],
["US",587819,-1,"Meta Prometheus Phase 4",2026.15,"P",9],
["US",558828,-1,"Microsoft Fairwater Wisconsin Phase 1",2026.25,"P",1],
["US",525518,-1,"Google Cedar Rapids Phase 4",2027.9,"P",10],
["US",514436,-1,"Amazon Madison Mega Site Phase 2",2026.71,"P",16],
["US",510359,-1,"OpenAI Stargate Abilene Phase 3",2026.25,"P",11],
["US",497557,-1,"Meta Prometheus Phase 3",2026.05,"P",9],
["US",478655,-1,"Coreweave Helios Phase 2",2028.0,"P",14],
["US",471566,-1,"Anthropic-Amazon New Carlisle Phase 2",2025.98,"P",12],
["US",469429,-1,"Fluidstack Lake Mariner Phase 5",2027.25,"P",17],
["US",454775,1,"Applied Digital Ellendale Possible Ph...",2027.5,"P",18],
["US",378979,1,"Nebius New Jersey",2026.5,"P",-1],
["US",374125,-1,"Microsoft Fairwater Atlanta Phase 1",2025.79,"P",13],
["US",327943,-1,"Google New Albany Phase 5",2026.96,"P",19],
["US",320364,-1,"Google Omaha Phase 5",2027.57,"P",20],
["US",313290,-1,"Google Cedar Rapids Phase 3",2027.39,"P",10],
["US",308236,-1,"Google Pryor (North) Phase 2",2026.38,"P",21],
["US",308236,-1,"OpenAI Stargate Shackelford Phase 1",2027.0,"P",3],
["US",300087,-1,"Anthropic-Amazon New Carlisle Phase 1",2025.48,"E",12],
["US",298041,1,"Oracle OCI Supercluster B200s",2025.5,"P",-1],
["US",280838,-1,"xAI Colossus 2 Phase 2",2026.03,"P",8],
["US",277918,1,"Applied Digital CoreWeave Ellendale P...",2026.5,"P",18],
["US",277918,-1,"xAI Colossus 2 Phase 1",2025.8,"P",8],
["US",275796,-1,"xAI Colossus 1 Phase 4",2025.56,"E",22],
["US",273876,-1,"Fluidstack Lake Mariner Phase 4",2026.83,"P",17],
["US",254674,-1,"OpenAI Stargate Abilene Phase 2",2025.74,"P",11],
["US",252653,1,"CoreWeave Denton GB200s OpenAI/Microsoft",2027.5,"P",-1],
["US",249026,-1,"Goodnight Phase 2",2026.62,"P",5],
["US",220313,-1,"Google Omaha Phase 4",2027.06,"P",20],
["US",214348,-1,"Amazon Madison Mega Site Phase 1",2025.48,"E",16],
["US",208318,-1,"Meta Temple Phase 2",2026.75,"P",23],
["US",207175,-1,"Google New Albany Phase 4",2025.79,"P",19],
["US",205145,-1,"Microsoft Goodyear Phase 3",2025.67,"P",24],
["US",202628,-1,"Google Cedar Rapids Phase 2",2027.14,"P",10],
["US",200000,-1,"xAI Colossus 1 Phase 3",2025.13,"E",22],
["US",173248,-1,"Meta Temple Phase 1",2025.94,"P",23],
["US",171479,-1,"Amazon Ridgeland Phase 1",2026.38,"P",15],
["US",163214,-1,"Google Council Bluffs (East) Phase 3",2026.44,"P",25],
["US",159552,-1,"Coreweave Helios Phase 1",2026.5,"P",14],
["US",154624,-1,"Vantage TX1 Phase 2",2027.67,"P",26],
["US",152627,-1,"Meta Prometheus Phase 2",2025.79,"P",9],
["US",135927,-1,"Google Omaha Phase 3",2026.35,"P",20],
["US",127337,-1,"OpenAI Stargate Abilene Phase 1",2025.49,"E",11],
["US",124513,-1,"Goodnight Phase 1",2026.46,"P",5],
["US",113694,1,"Applied Digital CoreWeave Ellendale P...",2025.88,"P",18],
["US",109651,-1,"Fluidstack Lake Mariner Phase 3",2026.42,"P",17],
["US",108641,-1,"Google New Albany Phase 3",2025.42,"E",19],
["US",101061,1,"CoreWeave Muskogee",2026.5,"P",-1],
["US",100000,1,"Tesla Cortex Phase 3",2026.5,"P",28],
["US",100000,1,"Meta 100k",2024.83,"E",-1],
["US",100000,-1,"xAI Colossus 1 Phase 2",2024.67,"E",22],
["US",92471,-1,"Google Council Bluffs (East) Phase 2",2025.46,"E",25],
["US",90955,1,"together.ai 36k GB200s",2025.12,"P",-1],
["US",71753,-1,"Fluidstack Lake Mariner Phase 2",2026.25,"P",17],
["US",71248,-1,"Google Cedar Rapids Phase 1",2026.24,"P",10],
["US",65536,1,"Oracle OCI Supercluster H200s",2024.89,"E",-1],
["US",65184,-1,"Google Omaha Phase 2",2024.88,"E",20],
["US",60753,-1,"Meta Prometheus Phase 1",2024.5,"E",9],
["US",58302,-1,"Microsoft Goodyear Phase 2",2025.04,"E",24],
["US",53562,-1,"Google New Albany Phase 2",2024.7,"E",19],
["US",52390,1,"Project Ceiba Phase 2",2025.5,"P",-1],
["US",50000,1,"Tesla Cortex Phase 1",2024.87,"E",28],
["US",50000,1,"Tesla Cortex Phase 2",2025.5,"P",28],
["US",44143,1,"Lawrence Livermore NL El Capitan Phase 2",2024.88,"E",-1],
["US",42000,1,"CoreWeave H200s",2024.66,"E",-1],
["US",38706,-1,"Vantage TX1 Phase 1",2026.12,"P",26],
["US",37746,-1,"Google Council Bluffs (East) Phase 1",2024.88,"E",25],
["US",36191,1,"Nebius Kansas City Phase 2",2025.38,"P",31],
["US",32000,0,"Lambda Labs H100/H200",2023.93,"E",-1],
["US",32000,1,"NVIDIA CoreWeave Eos-DFW Rumored Phase 2",2025.5,"P",32],
["US",29151,-1,"Microsoft Goodyear Phase 1",2023.31,"E",24],
["US",27590,-1,"Google Omaha Phase 1",2024.27,"E",20],
["US",26000,1,"Google A3 VMs",2025.5,"P",-1],
["US",25000,-1,"xAI Colossus 1 Phase 1",2024.61,"E",22],
["US",24576,1,"Meta GenAI 2024b",2024.2,"E",-1],
["US",24576,1,"Meta GenAI 2024a",2024.2,"E",-1],
["US",23699,-1,"Google New Albany Phase 1",2024.3,"E",19],
["US",22000,-1,"Inflection AI Cluster",2025.4372,"E",-1],
["US",21649,1,"Oracle OCI MI300x",2024.87,"E",-1],
["US",20000,-1,"Andreessen Horowitz Oxygen",2024.81,"E",-1],
["US",20000,-1,"AWS EC2 P5 UltraClusters",2023.57,"E",-1],
["US",19859,-1,"Fluidstack Lake Mariner Phase 1",2025.75,"P",17],
["US",17938,-1,"Google Pryor (North) Phase 1",2024.55,"E",21],
["US",16384,1,"Paper on Llama 3.1",2024.56,"E",-1],
["US",16384,1,"Oracle OCI Supercluster H100s",2024.29,"E",-1],
["US",14400,1,"Microsoft Azure Eagle",2023.87,"E",-1],
["US",13213,1,"TensorWave MI300X Cluster 2",2025.25,"P",-1],
["US",13213,1,"TensorWave MI300X Cluster 1 Phase 2",2025.25,"P",35],
["US",12218,1,"xAI Fulton Georgia",2025.5,"P",-1],
["US",11616,1,"NVIDIA MLPerf v4.0 Submission 2024",2024.45,"E",-1],
["US",10752,1,"Microsoft Azure MLPerf 3.1 Submission",2023.85,"E",-1],
["US",10752,1,"NVIDIA CoreWeave Eos-DFW Phase 1",2023.85,"E",32],
["US",10332,1,"Oracle OCI Supercluster A100s",2023.87,"E",-1],
["US",10117,-1,"Google TPUv5e",2023.85,"E",-1],
["US",10000,1,"Imbue 10k Cluster",2023.68,"E",-1],
["US",10000,1,"Poolside 10k Cluster",2025.4103,"E",-1],
["US",10000,1,"Tesla 10k H100 Cluster",2023.66,"E",-1],
["US",8000,1,"Magic G4 Google Cloud Rental",2024.5,"E",-1],
["US",5045,1,"Meta Research SuperCluster (RSC-1) Phase 2",2023.42,"E",-1],
["US",3584,1,"NVIDIA Coreweave MLPerf v3.0 2023",2023.46,"E",-1],
["US",2522,1,"Meta Research SuperCluster 2 (RSC-2)",2023.87,"E",-1],
["US",1917,1,"Meta Research SuperCluster (RSC-1) Phase 1",2022.1,"E",-1],
["US",908,1,"IBM Vela",2022.45,"E",-1],
["US",828,1,"Microsoft Ares/Maia",2023.91,"E",-1],
["US",8000,1,"Tesla Dojo 1 Planned Phase 2",2025.2869,"E",-1],
["US",7883,1,"Microsoft GPT-4 cluster",2022.33,"E",-1],
["US",7283,1,"Oak Ridge NL Frontier",2022.41,"E",-1],
["US",6367,-1,"AWS EC2 Trn1",2022.78,"E",-1],
["US",6144,1,"Paper on Movie Gen",2024.76,"E",-1],
["US",5045,1,"Meta Research SuperCluster (RSC-1) Ph...",2023.38,"E",39],
["US",5000,1,"Inflection-2 training cluster",2023.58,"E",40],
["US",4608,1,"NVIDIA Eos Phase 2",2023.83,"E",42],
["US",4567,1,"Lawrence Livermore NL Tuolumne",2024.88,"E",-1],
["US",4553,1,"Google Oklahoma TPU v4 Pods",2022.36,"E",-1],
["US",4424,1,"Together AI H100 Cluster",2023.79,"E",-1],
["US",4339,1,"Amazon Titan training cluster",2023.04,"E",-1],
["US",4156,1,"Google Hypercomputer TPU v5p pod",2023.93,"E",-1],
["US",4088,1,"Voltage Park Virginia",2025.692,"E",-1],
["US",4088,1,"Voltage Park Location 6",2025.9506,"E",-1],
["US",4088,1,"Voltage Park Texas Phase 2",2025.557,"E",45],
["US",4088,1,"Voltage Park Location 5",2025.0525,"E",-1],
["US",4088,1,"Voltage Park Utah",2025.1498,"E",-1],
["US",4088,1,"Voltage Park Washington",2025.3445,"E",-1],
["US",4032,1,"ExxonMobil Discovery 6",2025.46,"E",-1],
["US",4000,1,"CoreWeave LiquidLab",2024.5,"E",-1],
["US",4000,1,"Microsoft Azure ND H100 v5 VM",2023.2,"E",-1],
["US",4000,1,"Nebius Kansas City Phase 1",2025.29,"E",31],
["US",3984,1,"Gemini 1.0 Ultra training cluster A",2023.64,"E",-1],
["US",3984,1,"Gemini 1.0 Ultra training cluster B",2023.64,"E",-1],
["US",3964,1,"Vultr Chicago Cluster",2024.94,"E",-1],
["US",3874,1,"NFDG Andromeda Phase 2",2024.54,"E",47],
["US",3584,1,"NVIDIA Coreweave MLPerf v3.0 Submissi...",2023.42,"E",40],
["US",2850,1,"Paper on Gemma 2 27B",2024.49,"E",-1],
["US",2560,1,"Los Alamos NL Venado",2024.29,"E",-1],
["US",2522,1,"Meta Research SuperCluster 2 (RSC-2)",2023.83,"E",-1],
["US",2512,1,"NFDG Andromeda Phase 1",2023.45,"E",47],
["US",2321,1,"Tesla A100 Cluster Phase 2",2022.62,"E",48],
["US",2260,1,"Lawrence Berkeley NL NERSC Perlmutter",2021.38,"E",-1],
["US",2048,1,"Horizon Compute Baobab Phase 2",2025.17,"E",50],
["US",2000,1,"Reka H100 Rental",2023.96,"E",-1],
["US",1917,1,"Meta Research SuperCluster (RSC-1) Ph...",2022.06,"E",39],
["US",1816,1,"Tesla A100 Cluster Phase 1",2021.47,"E",48],
["US",1746,1,"Oak Ridge NL Summit",2018.44,"P",-1],
["US",1703,1,"Microsoft Azure Meta AI Rental",2022.4,"E",-1],
["US",1689,1,"Argonne NL Aurora",2024.37,"E",-1],
["US",1506,1,"Sandia NL El Dorado",2024.88,"E",-1],
["US",1413,1,"NVIDIA Selene Phase 2",2020.91,"E",-1],
["US",1413,1,"Paper on Megatron-Turing",2022.07,"E",-1],
["US",1390,1,"Meta 2017 V100 Cluster",2017.75,"E",-1],
["US",1321,1,"TensorWave MI300X Cluster 1 Phase 1",2024.25,"E",35],
["US",1271,1,"Tesla Training Cluster",2021.64,"E",-1],
["US",1261,-1,"AWS EC2 P4d",2020.84,"E",-1],
["US",1261,1,"Ezra-1 Stability AI AWS Cluster",2022.55,"E",-1],
["US",1138,1,"Paper on AFM-server",2024.44,"E",-1],
["US",1091,1,"Lawrence Livermore NL Sierra",2018.42,"E",-1],
["US",1024,1,"LeptonAI H100 Cluster",2024.64,"E",-1],
["US",1024,1,"IBM Blue Vela",2024.52,"E",-1],
["US",1024,1,"Horizon Compute Baobab Phase 1",2024.12,"E",50],
["US",1024,1,"Paper on Mamba 2 Hybrid",2024.45,"E",-1],
["US",1024,1,"NVIDIA Helios",2023.87,"E",-1],
["US",1024,1,"Chan Zuckerberg Initiative GPU Cluster",2025.04,"E",-1],
["US",1024,1,"NVIDIA Eos Phase 1",2023.39,"E",42],
["US",1024,1,"Denvr Dataworks H100",2024.79,"E",-1],
["US",1000,1,"Hut 8 H100 Cluster",2024.74,"E",-1],
["US",1000,1,"Voltage Park Texas Phase 1",2024.15,"E",45],
// === China (55 entries) ===
["China",132895,-1,"Alibaba Zhangbei Phase 2",2026.01,"P",27],
["China",66195,-1,"Alibaba Zhangbei Phase 1",2025.71,"P",27],
["China",30000,0,"Anon CN A",2024.96,"E",-1],
["China",24500,0,"DeepSeek Full Training Fleet [EST]",2025.0,"E",-1],
["China",20000,0,"Anon CN B",2024.21,"E",-1],
["China",20000,0,"Anon CN C",2024.54,"E",-1],
["China",20000,1,"Anon CN D",2025.7545,"E",-1],
["China",20000,-1,"Anon CN E",2024.87,"E",-1],
["China",20000,1,"Anon CN F",2025.2357,"E",-1],
["China",10500,1,"Baidu Kunlun P800 Training Cluster",2025.25,"E",-1],
["China",10000,1,"Anon CN G",2024.79,"E",-1],
["China",10000,1,"Anon CN H",2025.12,"E",-1],
["China",10000,0,"Anon CN I",2024.46,"E",-1],
["China",8000,1,"Anon CN J",2024.21,"E",-1],
["China",8000,1,"Anon CN K",2025.4941,"E",-1],
["China",8000,1,"Anon CN L",2024.62,"E",-1],
["China",8000,0,"Anon CN M",2023.29,"E",-1],
["China",6000,1,"Anon CN N",2022.62,"E",-1],
["China",6000,1,"Anon CN O",2025.2139,"E",-1],
["China",5000,1,"Anon CN P",2024.46,"E",-1],
["China",5000,1,"Anon CN Q",2025.12,"E",-1],
["China",4000,1,"Anon CN R",2023.71,"E",-1],
["China",4000,1,"Anon CN S",2024.62,"E",-1],
["China",4000,1,"Anon CN T",2024.37,"E",-1],
["China",4000,-1,"Anon CN U",2024.87,"E",-1],
["China",4000,1,"Anon CN V",2025.1915,"E",-1],
["China",3000,1,"Anon CN W",2024.5,"E",-1],
["China",3000,1,"Anon CN X",2021.21,"E",-1],
["China",3000,1,"Anon CN Y",2024.04,"E",-1],
["China",3000,1,"Anon CN Z",2021.54,"E",-1],
["China",3000,1,"Anon CN AA",2025.4968,"E",-1],
["China",3000,1,"Anon CN AB",2025.04,"E",-1],
["China",3000,0,"Anon CN AC",2024.46,"E",-1],
["China",2048,1,"DeepSeek V3 Training Cluster",2024.42,"E",-1],
["China",2000,1,"Anon CN AD",2024.71,"E",-1],
["China",2000,1,"Anon CN AE",2024.71,"E",-1],
["China",2000,1,"Anon CN AF",2024.21,"E",-1],
["China",2000,1,"Anon CN AG",2024.79,"E",-1],
["China",2000,1,"Anon CN AH",2021.29,"E",-1],
["China",2000,0,"Anon CN AI",2022.62,"E",-1],
["China",2000,1,"Anon CN AJ",2025.1486,"E",-1],
["China",2000,1,"Anon CN AK",2024.46,"E",-1],
["China",1140,1,"Huawei Pangu Ultra MoE 910Bs",2024.5,"E",-1],
["China",1000,1,"Anon CN AL",2024.04,"E",-1],
["China",1000,-1,"Anon CN AM",2025.933,"E",-1],
["China",1000,1,"Anon CN AN",2025.455,"E",-1],
["China",1000,1,"Anon CN AO",2025.6487,"E",-1],
["China",1000,1,"Anon CN AP",2024.87,"E",-1],
["China",1000,1,"Anon CN AQ",2022.54,"E",-1],
["China",1000,1,"Anon CN AR",2020.71,"E",-1],
["China",1000,0,"Anon CN AS",2022.87,"E",-1],
["China",1000,1,"Anon CN AT",2024.96,"E",-1],
["China",1000,1,"Anon CN AU",2025.1832,"E",-1],
["China",1000,1,"Anon CN AV",2024.71,"E",-1],
["China",1000,-1,"Anon CN AW",2025.914,"E",-1],
// === Ally (69 entries) ===
["Ally",20262759,-1,"Abu Dhabi UAE/USA 5GW Campus Phase 2",2030.5,"P",0],
["Ally",5103588,-1,"South Korea Planned 3GW Cluster",2028.5,"P",-1],
["US",2021223,-1,"OpenAI Stargate UAE Phase 2",2028.0,"P",0],
["Ally",1263264,1,"Fluidstack France Gigawatt Campus",2028.5,"P",-1],
["Ally",378979,1,"Sesterce Grand Est France B",2028.5,"P",-1],
["Ally",378979,1,"Sesterce Grand Est France A",2028.5,"P",-1],
["Ally",303183,1,"Sesterce Southern France 250MW",2028.5,"P",-1],
["US",252653,-1,"OpenAI Stargate UAE Phase 1",2026.92,"P",0],
["US",151592,1,"SK Group AWS Uslan Phase 2",2029.08,"P",-1],
["Ally",113694,1,"Nscale Loughton",2026.88,"P",-1],
["Ally",101061,1,"EU AI Gigafactory #3",2026.75,"P",-1],
["Ally",101061,1,"EU AI Gigafactory #4",2026.75,"P",-1],
["Ally",101061,1,"EU AI Gigafactory #1",2026.75,"P",-1],
["Ally",101061,1,"Sesterce Valence",2026.5,"P",-1],
["Ally",101061,1,"EU AI Gigafactory #2",2026.75,"P",-1],
["Ally",101061,1,"EU AI Gigafactory #5",2026.75,"P",-1],
["Ally",60000,1,"Nebius Finland Phase 2",2025.75,"P",29],
["Ally",26518,1,"Sesterce Pegasus",2025.5341,"E",-1],
["Ally",25265,1,"ParTec ELBJUWEL",2025.7599,"E",-1],
["Ally",23536,1,"\"Jupiter, Jülich\"",2025.44,"E",-1],
["Ally",16384,1,"NexGen Cloud Hyperstack AQ Compute Su...",2024.3,"E",-1],
["Ally",15096,1,"Sakura's B200s Phase 2",2028.12,"P",34],
["Ally",14553,1,"iGenius Colosseum",2025.5,"P",-1],
["Ally",13050,1,"Foxconn Big Innovation Cloud AI factory",2026.5,"P",-1],
["Ally",11642,1,"Foxconn Hon Hai Kaohsiung Supercomputer",2026.5,"P",-1],
["Ally",10752,1,"Alps Supercomputer Phase 2",2024.71,"E",36],
["Ally",9096,1,"SoftBank Planned B200 Superpod",2025.6754,"E",-1],
["Ally",8800,1,"S. Korea 6th national supercomputer",2026.5,"P",-1],
["Ally",8192,1,"Sesterce Nordics",2024.49,"E",-1],
["Ally",8000,1,"Nebius 8k Finland Phase 1",2024.36,"E",29],
["US",6670,1,"Microsoft Sweden Staffanstorp",2027.5,"P",-1],
["US",6670,1,"Microsoft Sweden Sandviken",2027.5,"P",-1],
["US",6670,1,"Microsoft Sweden Gävle",2027.5,"P",-1],
["Ally",6400,1,"Alps Supercomputer Phase 1",2024.42,"E",36],
["Ally",6128,1,"AIST ABCI 3.0",2025.05,"E",-1],
["Ally",5448,1,"University of Bristol Isambard-AI",2025.46,"E",-1],
["Ally",5053,1,"KDDI Sharp Sakai",2026.12,"P",-1],
["Ally",5000,-1,"Sustainable Metal Cloud Singapore Pha...",2024.75,"P",41],
["Ally",4992,1,"Nebius ISEG2",2025.46,"E",-1],
["Ally",4480,1,"Mare Nostrum 5",2023.83,"E",-1],
["Ally",4359,1,"EuroHPC Leonardo",2022.89,"E",-1],
["Ally",4096,1,"Sesterce Synapse Phase 2",2025.04,"E",43],
["Ally",4096,1,"Sesterce H100s Phase 2",2024.51,"E",44],
["Ally",4088,1,"PanaAI AUS AISF",2025.12,"P",-1],
["Ally",4000,1,"Sweden 4k H100 Cluster",2025.04,"E",-1],
["Ally",3153,1,"XTX Markets Cluster",2023.24,"E",-1],
["Ally",3032,1,"Novo Nordisk Gefion",2024.81,"E",-1],
["Ally",3000,1,"FPT AI Factory Japan",2025.12,"P",-1],
["Ally",2688,1,"CEA EXA1-HE Phase 3",2025.46,"E",-1],
["Ally",2688,1,"Eni HPC6",2024.88,"E",-1],
["Ally",2496,1,"Samsung SSC4",2025.46,"E",-1],
["Ally",2305,1,"EuroHPC LUMI",2022.71,"E",-1],
["Ally",2048,1,"Sesterce H100s Phase 1",2024.51,"E",44],
["Ally",2048,1,"Northern Data Group Taiga Cloud Island 4",2024.25,"E",-1],
["Ally",2048,1,"AIST ABCI-Q",2025.46,"E",-1],
["Ally",2048,1,"Northern Data Group Taiga Cloud NO1 I...",2024.25,"E",-1],
["Ally",2048,1,"Sesterce Synapse Phase 1",2024.75,"E",43],
["US",2048,1,"NVIDIA Israel-1 Phase 2",2024.89,"E",49],
["Ally",2048,1,"Northern Data Group Taiga Cloud Island 3",2024.25,"E",-1],
["Ally",2048,1,"Northern Data Group Taiga Cloud NO1 I...",2024.25,"E",-1],
["Ally",2048,1,"Northern Data Group Njored Taiga Clou...",2024.25,"E",-1],
["Ally",2040,1,"SoftBank CHIE-2",2024.83,"E",-1],
["Ally",2040,1,"SoftBank CHIE-3",2024.83,"E",-1],
["Ally",2016,1,"Sakura's H100s Phase 1",2024.58,"E",34],
["Ally",2000,1,"Quebec 2k H100 Cluster",2025.04,"E",-1],
["Ally",1908,1,"CEA EXA1-HE Phase 2",2024.29,"E",-1],
["Ally",1763,1,"Gcore data center Phase 2",2024.88,"P",-1],
["Ally",1587,1,"Jean Zay Supercomputer Phase 4",2024.71,"E",-1],
["Ally",1520,1,"Nebius ISEG",2023.83,"E",-1],
["Ally",1181,1,"JUWELS-Booster",2020.87,"E",-1],
["Ally",1120,1,"JCAHPC Miyabi",2025.04,"E",-1],
["Ally",1024,1,"Ubilink.AI Supercomputer",2024.88,"E",-1],
["Ally",1024,1,"Ori Global Cloud H100 Cluster",2024.79,"E",-1],
["Ally",1024,1,"Sustainable Metal Cloud Singapore Pha...",2024.41,"E",41],
["US",1024,1,"NVIDIA Israel-1 Phase 1",2023.89,"E",49],
["Ally",1016,1,"Scaleway Nabuchodonosor",2023.76,"E",-1],
["Ally",1000,1,"NHN Cloud's National AI Data Center",2023.83,"E",-1],
// === Other (18 entries) ===
["Other",5103588,-1,"DataVolt Neom 1.5 GW Phase 2",2031.5,"P",2],
["Other",1520970,-1,"HUMAIN Saudi Arabia Phase 2",2030.5,"P",6],
["Other",1136938,1,"Reliance Industries Supercomputer",2027.5,"P",-1],
["Other",510359,-1,"DataVolt Neom 1.5 GW Phase 1",2028.5,"P",2],
["US",55000,1,"G42 Microsoft 100Mw UAE Cluster",2025.62,"P",-1],
["Other",38979,1,"YTL AI Johor",2025.62,"P",-1],
["Other",16384,1,"Yotta Shakti Cloud D1",2025.5,"P",-1],
["Other",16384,1,"Yotta Shakti Cloud NM1 Phase 2",2025.5,"P",33],
["US",15000,1,"G42 Microsoft 30Mw UAE Cluster A",2025.5387,"E",-1],
["US",15000,1,"G42 Microsoft 30Mw UAE Cluster B",2025.0134,"E",-1],
["Other",12633,1,"Saudi Data & AI Authority Sovereign A...",2025.4046,"E",-1],
["Other",7475,1,"Aramco Groq Inference Cluster",2025.04,"E",-1],
["Other",4096,1,"Yotta Shakti Cloud NM1 Phase 1",2024.37,"E",33],
["Other",4000,1,"Telangana Yotta H1 Hyderbad AI City C...",2026.5,"P",-1],
["Other",4000,1,"OneAsia OBON Clusters",2025.9445,"E",-1],
["Other",3000,1,"FPT AI Factory Vietnam",2025.12,"P",-1],
["Other",2816,1,"KAUST Shaheen-III",2025.4369,"E",-1],
["Other",1501,1,"HUMAIN Saudi Arabia/NVIDIA Phase 1",2026.5,"P",6],
["US",1292,1,"Paper on Falcon 180B",2023.91,"E",-1],
["Other",1272,1,"Core42 SuperPOD",2024.83,"E",-1],
["Other",1024,1,"SIAM AI HGX",2024.7,"E",-1],
["Other",1024,1,"GreenNode Bangkok Cluster",2024.48,"E",-1],
];

const NOW = 2026.24;
// Model flag: temporarily simplify to US-only (China-strikes-US scenarios).
// When false: hide China column in scoreboard, China row in training timeline,
// and the "US strikes China" attack panel. CN's own development trajectory is
// not tracked. The China-strikes-US attack logic still works \u2014 it's what drives
// strike effects on US compute.
const MODEL_CHINA = true;
const ALGO_EPOCH = 2026.25; // March 2026: algorithmic efficiency compounds from here
const CLUSTERS = RAW.map(([c,g,sc,n,y,st,ch]) => ({ country:c, gpus:g, sc, name:n, year:y, status: y <= NOW ? "E" : "P", chain:ch }));

const P_BF16 = 9.895e14; // H100 SXM peak BF16 FLOP/s. All F_eff targets are in BF16.
const FLOP_PR = [
  { label:"1e29", exp:29 },
  { label:"1e30", exp:30 },
  { label:"1e31", exp:31 },
  { label:"1e32", exp:32 },
  { label:"1e33", exp:33 },
  { label:"1e34", exp:34 },
  { label:"1e35", exp:35 },
];

// === AIFP capability milestones (stated in Feb 2025 eFLOP) ===
// MAIM's internal flopExp is relative to ALGO_EPOCH (March 2026), so we
// subtract the OOMs of algorithmic progress between Feb 2025 and March 2026.
// Under AIFP defaults (sw_progress_rate_ref = 1.0 OOM/yr, reference_year = 2025),
// that's 1.125 years ~= 1.125 OOM ~= 13.3x.
const FLOP_EPOCH_SHIFT = 1.125; // OOMs subtracted to convert Feb-2025 \u2192 March-2026
const feb2025ToInternalExp = (feb2025Log10) => feb2025Log10 - FLOP_EPOCH_SHIFT;
const MILESTONES = [
  { key: "AC",    label: "AC",    hint: "Automated Coder",                  feb2025Log10: Math.log10(5e31) },
  { key: "SAR",   label: "SAR",   hint: "Superhuman AI Researcher",         feb2025Log10: Math.log10(1e33) },
  { key: "TED-AI", label: "TED-AI", hint: "Top-Expert-Dominating AI",        feb2025Log10: Math.log10(4e34) },
  { key: "SIAR",  label: "SIAR",  hint: "Superintelligent AI Researcher",   feb2025Log10: Math.log10(9e35) },
  { key: "ASI",   label: "ASI",   hint: "Artificial Superintelligence",     feb2025Log10: Math.log10(8e37) },
];

// === AIFP Compute Projections (AI Futures Project) ===
// [year, globalH100e, largestCompanySharePct, companyH100e]
// 2036-2040 extrapolated from AIFP input_data.csv experiment_compute growth
// (~1.50x/yr, slowing slightly).
const AIFP_DATA = [
  [2022, 620000, 1.0, 6200],
  [2023, 1300000, 2.0, 25400],
  [2024, 2800000, 4.5, 127700],
  [2025, 8100000, 6.0, 485700],
  [2026, 20700000, 10.0, 2100000],
  [2027, 47600000, 14.0, 6700000],
  [2028, 104700000, 15.0, 15700000],
  [2029, 225400000, 16.0, 36100000],
  [2030, 416100000, 17.0, 70700000],
  [2031, 715000000, 18.0, 128700000],
  [2032, 1200000000, 17.8, 210600000],
  [2033, 1900000000, 17.7, 336000000],
  [2034, 3000000000, 17.5, 526600000],
  [2035, 4700000000, 17.4, 813900000],
  [2036, 7190000000, 17.0, 1222300000],
  [2037, 10860000000, 16.8, 1824500000],
  [2038, 16290000000, 16.6, 2704100000],
  [2039, 24270000000, 16.5, 4004600000],
  [2040, 35920000000, 16.5, 5926800000],
];
// Country shares: TIME-VARYING. Today (~April 2026) we use Zakaria (2026a)'s
// full demand-side estimate, with China = 13.8% (incl. offshore remote-access
// compute Chinese firms operate from Singapore/Malaysia). By the time kinetic
// strikes are politically viable, BIS export-control tightening + cloud-provider
// KYC enforcement is assumed to (a) eliminate legal Nvidia imports to China,
// and (b) cut offshore remote-access compute by ~half. China's share falls to
// 9.1%; the freed 4.7 pp redistributes proportional to U.S. compute share,
// landing U.S. at 84.3%. Linear interpolation between SHARES_TRANSITION_START
// and the earliest enabled strike date.
const SHARES_NOW = { US: 0.80, China: 0.138, Ally: 0.056, Other: 0.006 };
// CN drops to 9.1% per BIS crackdown assumption (cf. comment above).
// U.S. share is held CONSTANT — the freed 4.7pp does not redistribute to
// U.S. (modeling the crackdown as shrinking global compute rather than
// reallocating it to U.S.). Total intentionally < 1.0.
const SHARES_AT_STRIKE = { US: 0.80, China: 0.091, Ally: 0.060, Other: 0.006 };
const SHARES_TRANSITION_START = 2026.33; // April 2026
// BIS crackdown completes by 2031 in our modeled world — pinned date,
// independent of any kinetic strike scenario. Applies to every caller.
const SHARES_TRANSITION_END = 2031.0;

function getCountryShares(year, _transitionEndYear /* deprecated; use SHARES_TRANSITION_END */) {
  const t0 = SHARES_TRANSITION_START;
  const t1 = SHARES_TRANSITION_END;
  if (year <= t0) return SHARES_NOW;
  if (year >= t1) return SHARES_AT_STRIKE;
  const f = (year - t0) / (t1 - t0);
  return {
    US: SHARES_NOW.US + f * (SHARES_AT_STRIKE.US - SHARES_NOW.US),
    China: SHARES_NOW.China + f * (SHARES_AT_STRIKE.China - SHARES_NOW.China),
    Ally: SHARES_NOW.Ally + f * (SHARES_AT_STRIKE.Ally - SHARES_NOW.Ally),
    Other: SHARES_NOW.Other + f * (SHARES_AT_STRIKE.Other - SHARES_NOW.Other),
  };
}

// Backward-compat: callers that don't have a year handy default to NOW shares.
const COUNTRY_SHARES = SHARES_NOW;
function aifpAt(year) {
  const row = AIFP_DATA.find(([y]) => y === year);
  if (!row) return null;
  const [, g, , c] = row;
  const usT = g * COUNTRY_SHARES.US, cnT = g * COUNTRY_SHARES.China;
  const natShare = usT > 0 ? c / usT : 0;
  return { global: g, usTotal: usT, cnTotal: cnT, usLead: c, cnLead: cnT * natShare, natShare };
}

// Interpolate the leading company's share of national compute at any year
function getCompanyShareOfNational(year) {
  const d = AIFP_DATA;
  const share = (row) => { const [, g, , c] = row; const nat = g * COUNTRY_SHARES.US; return nat > 0 ? c / nat : 0; };
  if (year <= d[0][0]) return share(d[0]);
  if (year >= d[d.length - 1][0]) return share(d[d.length - 1]);
  for (let i = 0; i < d.length - 1; i++) {
    if (year >= d[i][0] && year <= d[i + 1][0]) {
      const t = (year - d[i][0]) / (d[i + 1][0] - d[i][0]);
      return share(d[i]) + t * (share(d[i + 1]) - share(d[i]));
    }
  }
  return 0.1;
}

// === Simulated datacenter generation ===
// Uses Clymer/RD (factor 1.2) cumulative distribution, capped by AIFP max cluster size.
// New-build shares derived from cumulative evolution. Log-uniform sampling within buckets.

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; }

const SIM_BUCKETS = [
  [1000, 10000], [10000, 100000], [100000, 1000000], [1000000, 10000000],
  [10000000, 100000000], [100000000, 1000000000],
];
const SIM_BUCKET_LABELS = ['1K-10K', '10K-100K', '100K-1M', '1M-10M', '10M-100M', '100M-1B'];

// Lognormal-derived cumulative distribution (% of TOTAL US compute in each bucket).
// Order: [1K-10K, 10K-100K, 100K-1M, 1M-10M, 10M-100M, 100M-1B]
// Method: US-anchored truncated lognormal with PROPER iterative cap-and-redistribute.
//   sigma(t) = 1.640 + 0.713 * ln(t - 2021)   (logarithmic fit to Epoch 2022-2025 US data)
//   N(t)     = 226 * exp(0.281 * (t - 2025))  (log-linear fit to N_US in [99,138,192,226])
//   mu(t)    = ln(US_total / N) - sigma^2 / 2
//   Iterative cap-redistribute: clamp values > cap to cap, scale sub-cap by
//   (1 + excess/below_sum), repeat until all values <= cap. Converges in 2-3 iterations.
//   Result: a fraction of clusters end up exactly at the AIFP_MAX_CLUSTER value
//   (24-73% of US compute depending on year).
// US_total uses interpolated share (80% -> 84.3% by Jan 2031 strike).
const CUMUL_ANCHORS = [
  { year: 2022, shares: [0.988730, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000] },
  { year: 2023, shares: [0.998001, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000] },
  { year: 2024, shares: [0.107246, 0.886877, 0.000000, 0.000000, 0.000000, 0.000000] },
  { year: 2025, shares: [0.046207, 0.352591, 0.598198, 0.000000, 0.000000, 0.000000] },
  { year: 2026, shares: [0.022733, 0.172724, 0.802929, 0.000000, 0.000000, 0.000000] },
  { year: 2027, shares: [0.012451, 0.095543, 0.404079, 0.487000, 0.000000, 0.000000] },
  { year: 2028, shares: [0.007134, 0.057550, 0.266421, 0.668367, 0.000000, 0.000000] },
  { year: 2029, shares: [0.004194, 0.035366, 0.176693, 0.783440, 0.000000, 0.000000] },
  { year: 2030, shares: [0.002899, 0.024760, 0.128580, 0.406630, 0.436915, 0.000000] },
  { year: 2031, shares: [0.002165, 0.018489, 0.098128, 0.324074, 0.556981, 0.000000] },
  { year: 2032, shares: [0.001676, 0.014354, 0.077814, 0.267336, 0.638689, 0.000000] },
  { year: 2033, shares: [0.001381, 0.011712, 0.063909, 0.224535, 0.698353, 0.000000] },
  { year: 2034, shares: [0.001141, 0.009622, 0.052912, 0.189968, 0.445625, 0.300640] },
  { year: 2035, shares: [0.000952, 0.007982, 0.044208, 0.161833, 0.391831, 0.393116] },
  { year: 2036, shares: [0.000813, 0.006774, 0.037663, 0.139930, 0.347622, 0.467128] },
  { year: 2037, shares: [0.000705, 0.005830, 0.032523, 0.122436, 0.311249, 0.527197] },
  { year: 2038, shares: [0.000615, 0.005064, 0.028369, 0.108210, 0.281210, 0.576478] },
  { year: 2039, shares: [0.000541, 0.004438, 0.024983, 0.096544, 0.256257, 0.617188] },
  { year: 2040, shares: [0.000479, 0.003923, 0.022203, 0.086919, 0.235462, 0.650971] },
];
function getCumulShares(year) {
  const a = CUMUL_ANCHORS;
  if (year <= a[0].year) return a[0].shares;
  if (year >= a[a.length - 1].year) return a[a.length - 1].shares;
  for (let i = 0; i < a.length - 1; i++) {
    if (year >= a[i].year && year <= a[i + 1].year) {
      const t = (year - a[i].year) / (a[i + 1].year - a[i].year);
      return a[i].shares.map((s, j) => s + t * (a[i + 1].shares[j] - s));
    }
  }
  return a[a.length - 1].shares;
}

// AIFP max cluster size per year (H100-eq). Caps the top bucket.
const AIFP_MAX_CLUSTER = [
  [2023, 7200], [2024, 29000], [2025, 116000], [2026, 414700],
  [2027, 1300000], [2028, 3100000], [2029, 7200000], [2030, 14100000],
  [2031, 25700000], [2032, 42100000], [2033, 67200000], [2034, 105300000], [2035, 162800000],
  // Extrapolated 2036-2040 (growth slowing ~1.5x \u2192 1.3x/yr)
  [2036, 244000000], [2037, 354000000], [2038, 495600000], [2039, 669000000], [2040, 870000000],
];
function getMaxCluster(year) {
  // Linear-in-log interpolation between adjacent integer-year cap values so
  // fractional years (from time-varying lag) produce smooth transitions.
  if (year <= AIFP_MAX_CLUSTER[0][0]) return AIFP_MAX_CLUSTER[0][1];
  for (let i = 0; i < AIFP_MAX_CLUSTER.length - 1; i++) {
    const [y0, v0] = AIFP_MAX_CLUSTER[i];
    const [y1, v1] = AIFP_MAX_CLUSTER[i + 1];
    if (year >= y0 && year < y1) {
      const f = (year - y0) / (y1 - y0);
      // Interpolate in log space (caps grow geometrically)
      const lv = Math.log(v0) + f * (Math.log(v1) - Math.log(v0));
      return Math.exp(lv);
    }
  }
  return AIFP_MAX_CLUSTER[AIFP_MAX_CLUSTER.length - 1][1];
}

// Per-year NEW BUILD bucket shares — fraction of each year's NEW US compute in each tier.
// Computed from a per-year lognormal Lognormal(mu_new(t), sigma(t)) of new builds, with
// iterative cap-and-redistribute at AIFP_MAX_CLUSTER. Replaces the prior cumul-share-diff
// derivation, which clipped negative diffs and incorrectly produced zero new builds in
// some buckets when their cumul share dropped (e.g., 2030 1M-10M).
//   sigma(t) = 1.639 + 0.688 * ln(t - 2021)
//   N_new(t) = N(t) - N(t-1) where N(t) = 246 * exp(0.296 * (t-2025))
//   T_new(t) = (AIFP[t] - AIFP[t-1]) * us_share(t)
//   mu_new(t) = ln(T_new / N_new) - sigma^2 / 2
const NEW_BUILD_ANCHORS = {
  2023: [1.000000, 0.000000, 0.000000, 0.000000, 0.000000, 0.000000],
  2024: [0.016746, 0.983254, 0.000000, 0.000000, 0.000000, 0.000000],
  2025: [0.011630, 0.197665, 0.790705, 0.000000, 0.000000, 0.000000],
  2026: [0.008652, 0.106117, 0.885231, 0.000000, 0.000000, 0.000000],
  2027: [0.005682, 0.061209, 0.356242, 0.576867, 0.000000, 0.000000],
  2028: [0.003454, 0.036976, 0.222846, 0.736723, 0.000000, 0.000000],
  2029: [0.002107, 0.022728, 0.142606, 0.832558, 0.000000, 0.000000],
  2030: [0.001796, 0.018145, 0.109512, 0.395538, 0.475009, 0.000000],
  2031: [0.001523, 0.014727, 0.086974, 0.314237, 0.582539, 0.000000],
  2032: [0.001270, 0.012021, 0.070802, 0.259916, 0.655990, 0.000000],
  2033: [0.001182, 0.010707, 0.061348, 0.222682, 0.704080, 0.000000],
  2034: [0.001000, 0.008944, 0.051318, 0.189186, 0.448508, 0.301043],
  2035: [0.000861, 0.007598, 0.043561, 0.162476, 0.394596, 0.390906],
  2036: [0.000784, 0.006764, 0.038361, 0.143132, 0.351643, 0.459315],
  2037: [0.000708, 0.006014, 0.033914, 0.127096, 0.316782, 0.515485],
  2038: [0.000637, 0.005351, 0.030119, 0.113705, 0.288107, 0.562080],
  2039: [0.000577, 0.004802, 0.027009, 0.102740, 0.264489, 0.600382],
  2040: [0.000526, 0.004346, 0.024445, 0.093705, 0.244955, 0.632021],
};

function getNewBuildShares(year) {
  const lo = Math.floor(year);
  const hi = lo + 1;
  const a = NEW_BUILD_ANCHORS[lo];
  const b = NEW_BUILD_ANCHORS[hi];
  const fallback = [0.05, 0.15, 0.25, 0.30, 0.20, 0.05];
  if (!a) return b || fallback;
  if (!b) return a;
  const f = year - lo;
  return a.map((v, i) => v * (1 - f) + b[i] * f);
}

// Apply AIFP max cluster cap: redistribute budget from invalid buckets downward
function capBuildShares(shares, maxSize) {
  const capped = [...shares];
  for (let i = SIM_BUCKETS.length - 1; i >= 0; i--) {
    if (SIM_BUCKETS[i][0] > maxSize && capped[i] > 0) {
      if (i > 0) capped[i - 1] += capped[i];
      capped[i] = 0;
    }
  }
  return capped;
}

// Country-specific max cluster cap multipliers (relative to AIFP global max)
// All blocs share the AIFP frontier cap. Per-bloc cluster size constraints emerge
// naturally from compute share: smaller blocs have smaller new-build budgets, so they
// sample fewer clusters from the same lognormal and the max-of-N is naturally smaller.
const SIM_MAX_MULTIPLIER = { US: 1.0, China: 1.0, Ally: 1.0, Other: 1.0 };
// Runtime-override helper for testing CN-specific structural caps without rebuilding.
function simMaxMultFor(country) {
  if (typeof window !== 'undefined' && window.__SIM_MAX_OVERRIDE && window.__SIM_MAX_OVERRIDE[country] != null) {
    return window.__SIM_MAX_OVERRIDE[country];
  }
  return SIM_MAX_MULTIPLIER[country] || 1.0;
}

// Per-bloc DISTRIBUTION-SHAPE lag (in years). Compute totals are unchanged; only
// the SHAPE of the buildout (cluster-size distribution and per-year cluster-size cap)
// shifts to an earlier year. Reflects buildout-strategy differences — fewer Chinese
// hyperscalers concentrating into mega-clusters, East-Data-West-Compute regional
// dispersion, provincial grid-capacity limits — not chip quality or compute totals
// (those are handled separately via country shares).
const BLOC_SHAPE_LAG = { US: 0, China: 1, Ally: 0, Other: 0 };
// Default flat σ-offset for China relative to US. Set to 0: CN gets the same
// shape parameter as US (no σ shrink). Empirical Δσ measurements at the ≥1K
// filter (~0.36 in 2024) don't port to the model's full-data σ formula
// (σ_US grows to ≈3+ by 2030) without arbitrary scaling. Keeping Δσ=0 says
// the only non-arbitrary thing: CN has US's shape, just shifted in mean.
const CN_SIGMA_OFFSET_DEFAULT = 0;
// Natural-log offset on CN's lognormal location parameter (μ). Δμ=0.94 from a
// joint regression on the full Epoch 2022-2025 cluster dataset (no size filter):
//   ln(gpus_i) ~ α + β·year_i + γ·is_China_i   →   Δμ = -γ
//   n=187 (US=124, CN=63), Δμ = 0.937 ± 0.245 (se), 95% CI [0.46, 1.42],
//   median ratio 2.55× (CI [1.58×, 4.13×]). Country×year interaction is
//   insignificant (t=0.18), supporting a constant structural gap vs a time-
//   varying one. Per-year fits bounce (0.67/1.72/0.48/1.52 for 2022-2025)
//   because CN samples are small per year — pooling is the honest estimate.
//   Paired with Δσ=0 (CN inherits US's spread, just smaller mean cluster).
const CN_MU_OFFSET_DEFAULT = 0.94;
// Runtime overrides:
//   - window.__BLOC_SHAPE_LAG_MODE = "constant_year": use BLOC_SHAPE_LAG as a fixed
//     year-lag (legacy behavior).
//   - window.__cnSigmaOffset = <number>: override the constant σ gap value.
//   - default (no override): constant_sigma_gap with CN_SIGMA_OFFSET_DEFAULT.
function laggedYear(country, year) {
  if (typeof window !== 'undefined' && window.__BLOC_SHAPE_LAG_MODE === 'constant_year') {
    return Math.max(2023, year - (BLOC_SHAPE_LAG[country] || 0));
  }
  if (country !== 'China') {
    return Math.max(2023, year - (BLOC_SHAPE_LAG[country] || 0));
  }
  // Multiplicative mode (window.__cnSigmaMode === 'multiplicative'):
  // σ_CN(t) = f · σ_US(t), where σ_US(t) = a + b·ln(t-2021), a=1.629, b=0.718.
  // Solve for shapeYear t' such that σ_US(t') = f · σ_US(t):
  //   ln(t'−2021) = (a(f−1))/b + f · ln(t−2021)
  //   t'−2021 = exp(a(f−1)/b) · (t−2021)^f
  if (typeof window !== 'undefined' && window.__cnSigmaMode === 'multiplicative') {
    const f = typeof window.__cnSigmaScale === 'number' ? window.__cnSigmaScale : 0.70;
    const a = 1.629, b = 0.718;
    const t = Math.max(year - 2021, 0.5);
    const shapeOffset = Math.exp(a * (f - 1) / b) * Math.pow(t, f);
    return Math.max(2023, 2021 + shapeOffset);
  }
  // Default: constant_sigma_gap. Solve σ_US(t) − σ_US(t') = δ:
  //   t' − 2021 = (t − 2021) · exp(−δ/b)
  const offset = (typeof window !== 'undefined' && typeof window.__cnSigmaOffset === 'number')
    ? window.__cnSigmaOffset
    : CN_SIGMA_OFFSET_DEFAULT;
  const t = Math.max(year - 2021, 0.5);
  const scale = Math.exp(-offset / 0.718);
  return Math.max(2023, 2021 + scale * t);
}


// Shift per-bucket shares to model "same shape, smaller central cluster":
// CN cluster sizes are scaled by exp(-dmu) vs US (dmu = natural-log offset).
// Buckets are log10-spaced, so a shift of dmu/ln(10) buckets to the left.
// Mass from US's smallest bucket that scales below the model's floor is
// piled into the bottom bucket (≈ "everything below 1K H100e tracked as 1K").
function shiftSharesByMu(shares, dmu) {
  if (!dmu || dmu <= 0) return shares;
  const alpha = dmu / Math.log(10);
  if (alpha >= 1) {
    // For shifts of one or more whole buckets, apply iteratively.
    let cur = shares;
    let remaining = alpha;
    while (remaining >= 1) {
      const stepped = new Array(cur.length).fill(0);
      stepped[0] = cur[0] + cur[1];  // bucket 0 absorbs all of bucket 0 + bucket 1
      for (let j = 1; j < cur.length - 1; j++) stepped[j] = cur[j + 1];
      stepped[cur.length - 1] = 0;
      cur = stepped;
      remaining -= 1;
    }
    return shiftSharesByMu(cur, remaining * Math.log(10));
  }
  const out = new Array(shares.length).fill(0);
  for (let j = 0; j < shares.length; j++) {
    out[j] = (1 - alpha) * shares[j];
    if (j + 1 < shares.length) out[j] += alpha * shares[j + 1];
  }
  // Preserve total mass: the alpha-portion of the smallest US bucket would
  // scale below bucket 0 in CN-land; pile it back into bucket 0 (treated as
  // the model's floor).
  out[0] += alpha * shares[0];
  return out;
}

// Country-specific bucket shares: US/Ally/Other use US's lognormal as-is at
// the shapeYear; China gets a μ-shift to model smaller-mean clusters with
// same spread. Runtime override: window.__cnMuOffset = <number>.
function getCountryShapeShares(country, shapeYear) {
  const raw = getNewBuildShares(shapeYear);
  if (country !== 'China') return raw;
  const dmu = (typeof window !== 'undefined' && typeof window.__cnMuOffset === 'number')
    ? window.__cnMuOffset
    : CN_MU_OFFSET_DEFAULT;
  return shiftSharesByMu(raw, dmu);
}


const SIM_COUNTRY_SHARES = SHARES_NOW;

// Post-strike addition model:
//   addition(t) = baseline_frac × G(t)
// where G(t) is the counterfactual addition rate at year t, and baseline_frac is
// the surviving share of new-build capacity after SC chokepoints are destroyed.
// No recovery curve: ASML and Zeiss SMT are single-source bottlenecks whose
// reconstitution timescale (15-25+ years) exceeds the AI-development window we
// model, so we treat post-strike capacity as a permanent reduction.
//
// US/Ally: baseline_frac = 0.05 (Samsung + Intel surviving share after TSMC loss)
// China:   baseline_frac = 0.484 (SMIC alone if only TSMC-dependent flow is cut)
//          or 0.05 (full SMIC + TSMC strike)
// Pipeline delay: chips already in flight still get delivered (~3 months).
const SC_PIPELINE_DELAY = 0.25;
// Phase-in window: how long after pipeline-delay end the SC effect ramps from
// 1.0 (no effect) down to `baseline`. Set to 0 to recover instant-SC behavior.
const SC_PHASE_IN_YEARS = 0.25;

function getPostStrikeShares(country, cs) {
  // Each struck component leaves a 5% residual (damaged-but-operating fabs,
  // dispersed inventory, small alternative producers). The other 95% is the
  // permanent loss. The `recovery` field is retained for API stability — it
  // represents the destroyed share but is no longer added back over time.
  const RESIDUAL = 0.05;
  if (country === "China") {
    const SMIC = 0.484;          // SMIC domestic share of CN supply
    const TSMC_DEP = 0.516;      // smuggling + remote-access share
    const smicSurviving = cs.smicStrike ? SMIC * RESIDUAL : SMIC;
    const smicDestroyed = cs.smicStrike ? SMIC * (1 - RESIDUAL) : 0;
    const tsmcSurviving = cs.tsmcStrike ? TSMC_DEP * RESIDUAL : TSMC_DEP;
    const tsmcDestroyed = cs.tsmcStrike ? TSMC_DEP * (1 - RESIDUAL) : 0;
    return {
      baseline: smicSurviving + tsmcSurviving,
      recovery: smicDestroyed + tsmcDestroyed,
    };
  }
  // US/Ally: 5% surviving (Samsung + Intel) + 95% destroyed (TSMC, permanent)
  return { baseline: RESIDUAL, recovery: 1 - RESIDUAL };
}

// Returns the post-strike addition fraction (post-strike rate / counterfactual rate)
// for cluster sizing and growth scaling. The pre-strike->post-strike transition is
// a simple scalar applied to the current-year counterfactual: the destruction
// fraction starts high (e.g. 95% for a US TSMC strike, "baseline" = 5% surviving)
// and stays at that floor permanently — there is no recovery curve. The 3-month
// phase-in ramps from 1.0 (in-flight pipeline) down to `baseline`.
// `baseNewGlobal` and `baselineAtStrike` are kept in the signature for API
// stability but are no longer consulted — the result depends only on country,
// time-since-strike, and which SC chokepoints were hit.
function getPostStrikeFraction(country, year, cs /*, baseNewGlobal, baselineAtStrike */) {
  if (!cs || cs.strikeYear == null) return 1.0;
  const effStrike = cs.strikeYear + SC_PIPELINE_DELAY;
  if (year < effStrike) return 1.0;
  // Determine the post-strike "baseline" (the permanent floor after phase-in):
  //   - TSMC strike: uses getPostStrikeShares.baseline (5% for full SC strike).
  //   - Non-TSMC (e.g. SMIC-only on China): uses cs.scFactor (e.g. 0.54 — China
  //     loses 46% from SMIC but retains TSMC imports). The phase-in applies to
  //     ALL strikes uniformly so the post-strike dynamics are consistent across
  //     strike types.
  const baseline = cs.tsmcStrike
    ? getPostStrikeShares(country, cs).baseline
    : (cs.scFactor != null ? cs.scFactor : 1.0);
  const yrsSince = year - effStrike;
  if (yrsSince < SC_PHASE_IN_YEARS) {
    const f = SC_PHASE_IN_YEARS > 0 ? yrsSince / SC_PHASE_IN_YEARS : 1.0;
    return 1.0 + f * (baseline - 1.0);
  }
  return baseline;
}

// Time-average of the SC factor over an interval [a, b] (both expressed in
// yrsSince the effective strike date). Used by the bucket loop to integrate
// the gradual SC ramp over the post-strike portion of each AIFP year, instead
// of evaluating it at a single point. Without this, a 3-month phase-in
// evaluated at evalYear=scEffStrike returns 1.0 (no SC) for the year that
// contains the strike — under-counting the SC effect.
function avgPostStrikeFactor(country, cs, a, b) {
  if (b <= a) return 1.0;
  if (!cs || cs.strikeYear == null) return 1.0;
  // Use TSMC baseline (5%) when TSMC is struck; otherwise use cs.scFactor (the
  // partial-disruption fraction, e.g. 0.54 for SMIC-only on China). Phase-in
  // applies uniformly; no recovery curve.
  const baseline = cs.tsmcStrike
    ? getPostStrikeShares(country, cs).baseline
    : (cs.scFactor != null ? cs.scFactor : 1.0);
  const PI = SC_PHASE_IN_YEARS;
  let integral = 0;
  // Phase-in segment [0, PI]: f(t) = 1 - (t/PI) * (1-baseline)
  const pa = Math.max(0, a), pb = Math.min(PI, b);
  if (pa < pb && PI > 0) {
    integral += (pb - pa) - (1 - baseline) / (2 * PI) * (pb*pb - pa*pa);
  } else if (pa < pb && PI === 0) {
    integral += baseline * (pb - pa);  // collapse to instant baseline
  }
  // Permanent post-phase-in segment [PI, ∞): f = baseline
  const sa = Math.max(PI, a), sb = b;
  if (sa < sb) integral += baseline * (sb - sa);
  return integral / (b - a);
}

// Backward-compat wrapper for callers that pass year-since-strike directly without
// the global baseNewGlobal context. Used for real-cluster sizing where we don't
// have direct access to the year-specific increment; we look it up from AIFP_DATA.
function getRecoveredSCFactor(country, year, cs) {
  if (!cs || cs.strikeYear == null) return 1.0;
  if (!cs.tsmcStrike) {
    return cs.scFactor != null ? cs.scFactor : 1.0;
  }
  // Look up the year's counterfactual addition from AIFP_DATA
  const yrFloor = Math.floor(year);
  let baseNewGlobal = null;
  for (let i = 1; i < AIFP_DATA.length; i++) {
    if (AIFP_DATA[i][0] === yrFloor) {
      baseNewGlobal = Math.max(0, AIFP_DATA[i][1] - AIFP_DATA[i - 1][1]);
      break;
    }
  }
  const baselineAtStrike = getStrikeYearBaseline(cs.strikeYear);
  return getPostStrikeFraction(country, year, cs, baseNewGlobal, baselineAtStrike);
}

// Look up the AIFP_DATA increment in the strike year. Retained for callers that
// still pass it through; no longer consulted by the SC factor calculation since
// recovery was removed.
function getStrikeYearBaseline(strikeYear) {
  const yr = Math.floor(strikeYear);
  for (let i = 1; i < AIFP_DATA.length; i++) {
    if (AIFP_DATA[i][0] === yr) {
      return Math.max(0, AIFP_DATA[i][1] - AIFP_DATA[i - 1][1]);
    }
  }
  return null;
}

// === Analytical strike-outcome formulas (in-expectation over the bucket model) ===
// For a log-uniform cluster-size distribution on [a, b]:
//   PDF f(x) = 1 / (x · ln(b/a))
//   E[X] = (b - a) / ln(b/a)
//   compute fraction above T = (b - T) / (b - a)        (linear in T)
//   count above T per unit compute = ln(b/T) / (b - a)
// These are the deterministic mean of the random sampling done in
// generateSimulatedClusters, NOT a single realization.

function _analyticFracAbove(T, a, b) {
  if (T <= a) return 1;
  if (T >= b) return 0;
  return (b - T) / (b - a);
}

function _analyticCountAbovePerCompute(T, a, b) {
  if (T <= a) return Math.log(b / a) / (b - a);
  if (T >= b) return 0;
  return Math.log(b / T) / (b - a);
}

function _analyticCountAllPerCompute(a, b) {
  return Math.log(b / a) / (b - a);
}

// What fraction of a year's clusters are "existing at strike" by the same
// criterion computeStats uses (yearFrac <= strikeDate + 0.05). Clusters are
// uniform in [year, year + 0.99] in the sampler, so this is linear in strikeDate.
function _analyticExistingFrac(year, strikeDate) {
  const cut = strikeDate + 0.05;
  if (year + 0.99 <= cut) return 1;
  if (year >= cut) return 0;
  return Math.max(0, Math.min(1, (cut - year) / 0.99));
}

// Per-year, per-bucket incremental new compute from REAL clusters,
// deduplicated across multi-phase chains. Each cluster entry's `gpus` is the
// chain's CUMULATIVE size at that phase (not the additive new compute), so
// naively summing c.gpus per year double-counts every chain's earlier phases.
// The correct "new compute added in year Y" is `max(phase.gpus in Y) -
// max(phase.gpus before Y)`, summed across chains. Each increment is bucketed
// by the phase's own cumulative size (the bucket the cluster is in AT that
// phase). Returns Map<year, number[]> with one entry per SIM_BUCKETS bucket.
function _bucketIndexForGpus(g) {
  for (let i = 0; i < SIM_BUCKETS.length; i++) {
    const [lo, hi] = SIM_BUCKETS[i];
    if (g >= lo && g < hi) return i;
  }
  return SIM_BUCKETS.length - 1;
}
const _existingNewByYearAndBucketCache = new Map();
function existingNewByYearAndBucketForCountry(country) {
  // Debug flag: window.__excludeRealPostYear = N drops all real clusters with
  // year > N from both the real-subtraction map AND the analytical site count.
  // Cache is keyed by (country, excludeYear) to make the flag mutable.
  const excludeYear = (typeof window !== 'undefined' && typeof window.__excludeRealPostYear === 'number')
    ? window.__excludeRealPostYear : Infinity;
  const cacheKey = `${country}|${excludeYear}`;
  if (_existingNewByYearAndBucketCache.has(cacheKey)) return _existingNewByYearAndBucketCache.get(cacheKey);
  const chainPhases = new Map();
  let standaloneIdx = 0;
  for (const c of CLUSTERS) {
    if (c.country !== country) continue;
    if (c.gpus < 1000 || c.year < 2022 || c.year >= 2041) continue;
    if (c.year > excludeYear) continue;
    const key = c.chain >= 0 ? `c${c.chain}` : `s${standaloneIdx++}`;
    if (!chainPhases.has(key)) chainPhases.set(key, []);
    chainPhases.get(key).push(c);
  }
  const yearMap = new Map();
  for (const phases of chainPhases.values()) {
    phases.sort((a, b) => a.year - b.year);
    let prevMax = 0;
    for (const p of phases) {
      const yr = Math.floor(p.year);
      const newCompute = Math.max(0, p.gpus - prevMax);
      if (newCompute > 0) {
        const bi = _bucketIndexForGpus(p.gpus);
        if (!yearMap.has(yr)) yearMap.set(yr, new Array(SIM_BUCKETS.length).fill(0));
        yearMap.get(yr)[bi] += newCompute;
      }
      if (p.gpus > prevMax) prevMax = p.gpus;
    }
  }
  _existingNewByYearAndBucketCache.set(cacheKey, yearMap);
  return yearMap;
}

// Per-year total (sum across buckets) — convenience wrapper.
function existingNewByYearForCountry(country) {
  const m = existingNewByYearAndBucketForCountry(country);
  const out = new Map();
  for (const [yr, arr] of m.entries()) out.set(yr, arr.reduce((s, v) => s + v, 0));
  return out;
}

// Bucket-aware subtraction: distribute newCountry across buckets via
// buildShares, subtract real-cluster compute from the bucket each cluster
// occupies, and spill any per-bucket overflow into the next-LARGER bucket.
// Returns per-bucket SIM budget after real subtraction. Excess in the
// largest bucket is dropped (cluster exceeds AIFP frontier cap).
function simBudgetsAfterRealSubtraction(country, year, newCountry, buildShares) {
  const realByBucket = (existingNewByYearAndBucketForCountry(country).get(year) || new Array(SIM_BUCKETS.length).fill(0)).slice();
  const budgets = buildShares.map(s => s * newCountry);
  for (let b = 0; b < SIM_BUCKETS.length; b++) {
    const real = realByBucket[b];
    if (real <= budgets[b]) {
      budgets[b] -= real;
    } else {
      const excess = real - budgets[b];
      budgets[b] = 0;
      if (b + 1 < SIM_BUCKETS.length) realByBucket[b + 1] += excess;
    }
  }
  return budgets;
}

// Compute strike outcome metrics analytically over the bucket distribution.
//   country     - "US" | "China" | "Ally" | "Other"
//   threshold   - strike threshold in H100-eq
//   strikeDate  - effective hit-detection date (no SC_PIPELINE_DELAY)
//   continuous  - true if continuous denial is on (preempt post-strike clusters)
//   cs          - supply-chain config { strikeYear, scFactor, tsmcStrike, smicStrike } or null
//   txEnd       - shares transition end year (Infinity if disabled)
//   preemptCutoff - upper-bound year for counting preempted clusters (post-strike
//                   clusters built after this don't matter — training already done).
//                   Pass Infinity for the unbounded count.
// Returns { destroyedCompute, destroyedCount, preemptedCompute, preemptedCount,
//           totalCompute, totalCount }.
//
// Methodology: replicates generateSimulatedClusters' budget construction year-by-year
// (pre-strike years use original SHARES_NOW + full budget; strike year + later use
// transitioning shares + SC-blended budget). Real Epoch clusters contribute their
// deterministic sizes; the bucket-distribution analytical formulas are applied to
// the REMAINING gap (newCountry - existingNew), exactly matching what the sampler does.
function analyticalStrikeOutcome(country, threshold, strikeDate, continuous, cs, txEnd, preemptCutoff = Infinity) {
  let destroyedCompute = 0, destroyedCount = 0;
  let preemptedCompute = 0, preemptedCount = 0;
  let totalCompute = 0, totalCount = 0;

  const scEffStrike = (cs && cs.strikeYear != null) ? cs.strikeYear + SC_PIPELINE_DELAY : Infinity;
  const scFloorYear = Math.floor(scEffStrike);
  const cutoff = strikeDate + 0.05;

  // === Real clusters: deterministic contribution, GROUPED INTO SITES BY CHAIN ===
  // The sampler groups clusters by chain ID (matching scPoints/computeStats line 2329):
  // multiple phases of the same physical site collapse into ONE site whose size is
  // max(phase.gpus) for phases built before strike. Without this grouping, the
  // analytic over-counts US sites by ~69 (since US has many multi-phase chains).
  const preemptCutoffPad = preemptCutoff === Infinity ? Infinity : preemptCutoff + 0.05;
  // Debug flag: drop real clusters with year > __excludeRealPostYear from the
  // analytical site count (paired with same filter in existingNewByYearAndBucket).
  const _excludeRealPostYear = (typeof window !== 'undefined' && typeof window.__excludeRealPostYear === 'number')
    ? window.__excludeRealPostYear : Infinity;
  const siteMap = new Map();
  let _siteIdx = 0;
  for (const c of CLUSTERS) {
    if (c.country !== country) continue;
    // Mirror points-filter: clusters with gpus < 1000 or year < 2022 or year >= 2041
    // are filtered out before reaching scPoints/scSites.
    if (c.gpus < 1000 || c.year < 2022 || c.year >= 2041) continue;
    if (c.year > _excludeRealPostYear) continue;
    let gpus = c.gpus;
    if (cs && cs.strikeYear != null && c.year > cs.strikeYear && c.year > NOW) {
      const factor = getRecoveredSCFactor(country, c.year, cs);
      gpus = Math.round(c.gpus * factor);
      if (gpus < 1000) continue;
    }
    const key = c.chain >= 0 ? 'c' + c.chain : 's' + (_siteIdx++);
    let site = siteMap.get(key);
    if (!site) {
      site = { maxGpus: 0, maxExistingGpus: 0, hasExisting: false, hasPostInWindow: false };
      siteMap.set(key, site);
    }
    if (gpus > site.maxGpus) site.maxGpus = gpus;
    if (c.year <= cutoff) {
      site.hasExisting = true;
      if (gpus > site.maxExistingGpus) site.maxExistingGpus = gpus;
    } else if (continuous && c.year <= preemptCutoffPad) {
      site.hasPostInWindow = true;
    }
  }
  for (const site of siteMap.values()) {
    if (site.hasExisting) {
      totalCompute += site.maxExistingGpus;
      totalCount += 1;
      if (site.maxExistingGpus >= threshold) {
        destroyedCompute += site.maxExistingGpus;
        destroyedCount += 1;
      }
    } else if (site.hasPostInWindow) {
      // post-strike-only site, in the cutoff window: counts toward preempted
      // if its peak compute exceeds threshold (matches sampler's
      // s.maxGpus >= effThreshold && s.maxExistingGpus < effThreshold filter)
      if (site.maxGpus >= threshold) {
        preemptedCompute += site.maxGpus;
        preemptedCount += 1;
      }
    }
  }

  // === Sim-equivalent gap: analytical bucket contribution ===
  for (let yi = 1; yi < AIFP_DATA.length; yi++) {
    const [year, globalTotal] = AIFP_DATA[yi];
    const [, prevTotal] = AIFP_DATA[yi - 1];
    const baseNewGlobal = globalTotal - prevTotal;
    if (baseNewGlobal <= 0) continue;

    // Distribution-shape lag: country-specific. CN's bucket shares and cluster cap
    // come from an earlier year (BLOC_SHAPE_LAG[country] years prior). Compute totals
    // are not lagged — only the SHAPE of the distribution shifts.
    const shapeYear = laggedYear(country, year);
    const baseGlobalMax = getMaxCluster(shapeYear);

    // Unified per-year compute attribution. Mirrors generateSimulatedClusters
    // line 1290+ exactly: always interpolate yearShares from SHARES_NOW (at t0)
    // toward SHARES_AT_STRIKE (by strike date), and only apply the SC reduction
    // to the post-strike fraction of the year. The earlier `year < scFloorYear`
    // shortcut bypassed the interpolation in favour of flat SHARES_NOW, which
    // produced a discrete yearShare jump every time Math.floor(scEffStrike)
    // crossed an integer at strikeDate = year + 0.75 — the dominant recurring
    // source of the delay-vs-strike-date sawtooth.
    let newGlobal = baseNewGlobal;
    let isPost = false;
    if (cs && cs.strikeYear != null) {
      const preFrac = Math.max(0, Math.min(1, scEffStrike - year));
      if (preFrac < 1) {
        // Average SC factor over the post-strike portion of year Y, expressed
        // as yrsSince scEffStrike. With SC_PHASE_IN_YEARS=0 this matches the
        // single-point baseline evaluation; with PHASE_IN > 0 it correctly
        // integrates the gradual ramp.
        const psStart = Math.max(year - scEffStrike, 0);
        const psEnd = (year + 1) - scEffStrike;
        const psFactor = avgPostStrikeFactor(country, cs, psStart, psEnd);
        newGlobal = preFrac * baseNewGlobal + (1 - preFrac) * psFactor * baseNewGlobal;
        isPost = true;
      }
    }
    const effScF = baseNewGlobal > 0 ? newGlobal / baseNewGlobal : 1.0;
    const globalMax = isPost
      ? Math.round(baseGlobalMax * Math.max(effScF, 0.15))
      : baseGlobalMax;
    const countryMax = Math.round(globalMax * (simMaxMultFor(country)));
    const txEndForShares = (cs && cs.strikeYear != null) ? txEnd : Infinity;
    const yearShares = getCountryShares(year, txEndForShares);
    const newCountry = newGlobal * (yearShares[country] || 0);

    // Per-bucket sim budgets: distribute newCountry × buildShares across
    // buckets, then subtract each real cluster's incremental compute from
    // the bucket it sits in (spilling overflow to the next-larger bucket).
    const rawShares = getCountryShapeShares(country, shapeYear);
    const buildShares = capBuildShares(rawShares, countryMax);
    const simBucketBudgets = simBudgetsAfterRealSubtraction(country, year, newCountry, buildShares);
    const totalSimBudget = simBucketBudgets.reduce((s, v) => s + v, 0);
    if (totalSimBudget < 1000) continue;  // nothing left to allocate

    const existingFrac = _analyticExistingFrac(year, strikeDate);
    // For preempted compute: cluster must be built AFTER strike but BEFORE preemptCutoff.
    // cutoffFrac is the fraction of this year built before preemptCutoff (same shape
    // as existingFrac but using preemptCutoff). The post-strike-but-pre-cutoff window
    // is (cutoffFrac - existingFrac).
    const cutoffFrac = preemptCutoff === Infinity
      ? 1.0
      : _analyticExistingFrac(year, preemptCutoff);
    const postEffFrac = Math.max(0, cutoffFrac - existingFrac);

    for (let bi = 0; bi < SIM_BUCKETS.length; bi++) {
      const [lo, rawHi] = SIM_BUCKETS[bi];
      const hi = Math.min(rawHi, countryMax);
      if (hi <= lo || simBucketBudgets[bi] <= 0) continue;

      const fracAbove = _analyticFracAbove(threshold, lo, hi);
      const cntAbovePer = _analyticCountAbovePerCompute(threshold, lo, hi);
      const cntAllPer = _analyticCountAllPerCompute(lo, hi);

      const preBucket = simBucketBudgets[bi] * existingFrac;
      destroyedCompute += preBucket * fracAbove;
      destroyedCount += preBucket * cntAbovePer;
      totalCompute += preBucket;
      totalCount += preBucket * cntAllPer;

      if (continuous) {
        const postBucket = simBucketBudgets[bi] * postEffFrac;
        preemptedCompute += postBucket * fracAbove;
        preemptedCount += postBucket * cntAbovePer;
      }
    }
  }

  return {
    destroyedCompute, destroyedCount,
    preemptedCompute, preemptedCount,
    totalCompute, totalCount,
  };
}

// Binary-search inverse of analyticalStrikeOutcome: given a target % of national
// compute destroyed at strike, find the threshold T (in H100-eq) that achieves
// it. Used by the "set strike by % destroyed" slider mode so the user can pick
// a strike intensity directly in percentage terms rather than picking a
// threshold and reading off the resulting destruction.
// Expose analytical helpers on window so scripted sweeps can compute scenarios
// without driving the UI. Keeps the React render loop out of the critical path.
if (typeof window !== 'undefined') {
  // Defer to a microtask so all module-level functions are defined first.
  Promise.resolve().then(() => {
    window.analyticalStrikeOutcome = analyticalStrikeOutcome;
    window.analyticalSurvivingTimeline = analyticalSurvivingTimeline;
    window.thresholdForPctDestroyed = thresholdForPctDestroyed;
    window.monthlyThresholdForPctDestroyed = monthlyThresholdForPctDestroyed;
    window.monthlyDestroyedFracAtThreshold = monthlyDestroyedFracAtThreshold;
    window.__CLUSTERS = CLUSTERS;
    window.__SIM_CLUSTERS = SIM_CLUSTERS;
    window.__ALL_CLUSTERS = ALL_CLUSTERS;
    window.AIFP_DATA = AIFP_DATA;
    window.NOW = NOW;
    // Dynamic-threshold denial flag (default off — opt in for A/B testing).
    if (window.__dynamicThresholdDenial == null) window.__dynamicThresholdDenial = false;
  });
}

function thresholdForPctDestroyed(country, pctTarget, strikeDate, preempt, cs, txEnd, denialYears) {
  if (pctTarget <= 0.01) return 1e11;        // ~0% destroyed: above max cluster
  if (pctTarget >= 99.99) return 1000;       // ~100% destroyed: below min cluster
  const targetFrac = pctTarget / 100;
  let lo = 3, hi = 11;  // log10 bounds: 1K to 100B H100e
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const T = Math.pow(10, mid);
    const cutoff = preempt && denialYears != null ? strikeDate + denialYears : Infinity;
    const r = analyticalStrikeOutcome(country, T, strikeDate, preempt, cs, txEnd, cutoff);
    const frac = r.totalCompute > 0 ? r.destroyedCompute / r.totalCompute : 0;
    // Lower threshold catches more clusters → more destroyed. So if current frac
    // is BELOW target, we need a LOWER threshold (catch more) → move hi down.
    if (frac < targetFrac) hi = mid;
    else lo = mid;
  }
  return Math.pow(10, (lo + hi) / 2);
}

// === Dynamic-threshold continuous denial (prototype) ===
//
// Alternative denial mechanic: instead of holding the strike-date threshold
// fixed for `denialYears`, recompute a threshold at each post-strike month so
// that pctTarget% of THAT MONTH's new-build compute is destroyed. Reflects a
// strategic policy of "persistently neutralise X% of the country's new
// frontier compute" rather than "block above a fixed H100e level forever".
//
// Toggle at runtime via `window.__dynamicThresholdDenial = true/false`.
// Default off. When off, analyticalSurvivingTimeline keeps the original
// fixed-threshold semantics.

function monthlyDestroyedFracAtThreshold(country, threshold, monthCenter, cs, txEnd) {
  const scEffStrike = (cs && cs.strikeYear != null) ? cs.strikeYear + SC_PIPELINE_DELAY : Infinity;
  const year = Math.floor(monthCenter);
  let yi = -1;
  for (let i = 1; i < AIFP_DATA.length; i++) {
    if (AIFP_DATA[i][0] === year) { yi = i; break; }
  }
  if (yi < 1) return 0;
  const baseNewGlobal = AIFP_DATA[yi][1] - AIFP_DATA[yi - 1][1];
  if (baseNewGlobal <= 0) return 0;
  const baseNewMonthly = baseNewGlobal / 12;

  const shapeYear = laggedYear(country, year);
  const baseGlobalMax = getMaxCluster(shapeYear);
  const rawShares = getCountryShapeShares(country, shapeYear);

  const isPostMonth = monthCenter > scEffStrike;
  const scFactorMonth = isPostMonth ? getPostStrikeFraction(country, monthCenter, cs) : 1.0;
  const monthGlobalMax = isPostMonth
    ? Math.round(baseGlobalMax * Math.max(scFactorMonth, 0.15))
    : baseGlobalMax;
  const monthCountryMax = Math.round(monthGlobalMax * simMaxMultFor(country));
  const monthShares = getCountryShares(monthCenter, txEnd);
  const monthNewCountry = baseNewMonthly * scFactorMonth * (monthShares[country] || 0);

  const buildShares = capBuildShares(rawShares, monthCountryMax);
  const budgets = buildShares.map(s => s * monthNewCountry);
  const totalBudget = budgets.reduce((a, b) => a + b, 0);
  if (totalBudget <= 0) return 0;

  let destroyed = 0;
  for (let bi = 0; bi < SIM_BUCKETS.length; bi++) {
    const [lo, rawHi] = SIM_BUCKETS[bi];
    const hi = Math.min(rawHi, monthCountryMax);
    if (hi <= lo || budgets[bi] <= 0) continue;
    destroyed += budgets[bi] * _analyticFracAbove(threshold, lo, hi);
  }
  return destroyed / totalBudget;
}

function monthlyThresholdForPctDestroyed(country, pctTarget, monthCenter, cs, txEnd) {
  if (pctTarget <= 0.01) return 1e11;
  if (pctTarget >= 99.99) return 1000;
  const targetFrac = pctTarget / 100;
  let lo = 3, hi = 11;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const T = Math.pow(10, mid);
    const frac = monthlyDestroyedFracAtThreshold(country, T, monthCenter, cs, txEnd);
    if (frac < targetFrac) hi = mid;
    else lo = mid;
  }
  return Math.pow(10, (lo + hi) / 2);
}

// Build the post-strike surviving-compute trajectory analytically over the
// bucket distribution, paralleling analyticalStrikeOutcome's scalar math but
// producing a per-time-step time series. Drop-in replacement for
// buildComputeTimeline(survivingSites, ...) — eliminates the within-year
// sawtooth caused by individual sim-cluster yearFracs flipping pre/post strike
// as strikeDate sweeps. Real clusters contribute deterministically (their dates
// are factual); the bucket-distributed sim "gap" contributes its expected
// surviving compute, smeared uniformly across each year and discounted by the
// analytical destroyed-fraction-above-threshold.
//
// Returns a function totalAt(t) returning total surviving compute online at t.
function analyticalSurvivingTimeline(country, threshold, strikeDate, continuous, cs, txEnd, tMin, tMax, step, denialYears, pctTarget) {
  // Dynamic-threshold continuous denial: when window.__dynamicThresholdDenial
  // is true AND pctTarget is provided, recompute the threshold at each
  // post-strike month so pctTarget% of THAT month's new-build compute is
  // destroyed. When off, keep the fixed-threshold behaviour for backwards
  // compatibility. Toggleable for A/B comparison.
  const dynDenial = (typeof window !== 'undefined') && !!window.__dynamicThresholdDenial
                    && (pctTarget != null) && continuous;
  const scEffStrike = (cs && cs.strikeYear != null) ? cs.strikeYear + SC_PIPELINE_DELAY : Infinity;
  const scFloorYear = Math.floor(scEffStrike);
  const cut = strikeDate + 0.05;
  // Denial window: continuous denial actively prevents new above-threshold
  // builds for `denialYears` after the strike. After that, building resumes.
  // When continuous is false, the window collapses to strike-day only.
  const denialEnd = continuous ? strikeDate + (denialYears != null ? denialYears : Infinity) : strikeDate;
  const denialEndPad = denialEnd + 0.05;

  // === Real clusters: group into sites by chain, apply SC reduction, decide survival ===
  const realSiteMap = new Map();
  let _idx = 0;
  for (const c of CLUSTERS) {
    if (c.country !== country) continue;
    if (c.gpus < 1000 || c.year < 2022 || c.year >= 2041) continue;
    let gpus = c.gpus;
    if (cs && cs.strikeYear != null && c.year > cs.strikeYear && c.year > NOW) {
      const factor = getRecoveredSCFactor(country, c.year, cs);
      gpus = Math.round(c.gpus * factor);
      if (gpus < 1000) continue;
    }
    const key = c.chain >= 0 ? 'c' + c.chain : 's' + (_idx++);
    let site = realSiteMap.get(key);
    if (!site) {
      site = { phases: [], maxGpus: 0, maxExistingGpus: 0, maxInDenialWindow: 0 };
      realSiteMap.set(key, site);
    }
    site.phases.push({ year: c.year, gpus });
    if (gpus > site.maxGpus) site.maxGpus = gpus;
    if (c.year <= cut && gpus > site.maxExistingGpus) site.maxExistingGpus = gpus;
    if (c.year <= denialEndPad && gpus > site.maxInDenialWindow) site.maxInDenialWindow = gpus;
  }

  // Surviving-real events: for each site that wasn't destroyed, emit per-phase
  // deltas (matching buildComputeTimeline's max-phase-per-site accumulation).
  // A site is destroyed if its compute crosses threshold within the denial window
  // (which equals the pre-strike window when continuous=false).
  const realEvents = [];
  for (const site of realSiteMap.values()) {
    const destroyed = site.maxInDenialWindow >= threshold;
    if (destroyed) continue;
    const sorted = site.phases.slice().sort((a, b) => a.year - b.year);
    let curMax = 0;
    for (const p of sorted) {
      if (p.gpus > curMax) {
        realEvents.push({ year: p.year, delta: p.gpus - curMax });
        curMax = p.gpus;
      }
    }
  }
  realEvents.sort((a, b) => a.year - b.year);

  // === Per-month analytical sim contribution ===
  // Each AIFP year's compute additions are spread uniformly across 12 months.
  // Each month is evaluated at its own SC factor (continuous in monthCenter),
  // not via a year-averaged factor. Each month is unambiguously pre- or
  // post-strike, so the year-boundary smearing of existingFrac/preFrac that
  // produced the year+0.5-0.75 bumps in delay-vs-strike-date is removed.
  const MONTHS_PER_YEAR = 12;
  const monthEvents = [];
  for (let yi = 1; yi < AIFP_DATA.length; yi++) {
    const [year, globalTotal] = AIFP_DATA[yi];
    const [, prevTotal] = AIFP_DATA[yi - 1];
    const baseNewGlobal = globalTotal - prevTotal;
    if (baseNewGlobal <= 0) continue;
    const baseNewMonthly = baseNewGlobal / MONTHS_PER_YEAR;

    const shapeYear = laggedYear(country, year);
    const baseGlobalMax = getMaxCluster(shapeYear);
    const rawShares = getCountryShapeShares(country, shapeYear);
    const txEndForShares = (cs && cs.strikeYear != null) ? txEnd : Infinity;

    // Real-cluster subtraction is per-AIFP-year in the source data; apportion
    // uniformly across months. Aggregates back to the same yearly total but
    // applied at month resolution to avoid disproportionately subtracting
    // a month with a small SC-degraded budget.
    const realByBucketYr = (existingNewByYearAndBucketForCountry(country).get(year)
      || new Array(SIM_BUCKETS.length).fill(0));
    const realByBucketM = realByBucketYr.map(x => x / MONTHS_PER_YEAR);

    for (let mi = 0; mi < MONTHS_PER_YEAR; mi++) {
      const monthCenter = year + (mi + 0.5) / MONTHS_PER_YEAR;
      const isPostMonth = (cs && cs.strikeYear != null) && monthCenter > scEffStrike;
      const scFactorMonth = isPostMonth
        ? getPostStrikeFraction(country, monthCenter, cs)
        : 1.0;

      const monthGlobalMax = isPostMonth
        ? Math.round(baseGlobalMax * Math.max(scFactorMonth, 0.15))
        : baseGlobalMax;
      const monthCountryMax = Math.round(monthGlobalMax * (simMaxMultFor(country)));
      const monthShares = getCountryShares(monthCenter, txEndForShares);
      const monthNewGlobal = baseNewMonthly * scFactorMonth;
      const monthNewCountry = monthNewGlobal * (monthShares[country] || 0);

      const buildShares = capBuildShares(rawShares, monthCountryMax);
      // Per-bucket subtraction with overflow (clone real for this month).
      const realLeft = realByBucketM.slice();
      const budgets = buildShares.map(s => s * monthNewCountry);
      for (let b = 0; b < SIM_BUCKETS.length; b++) {
        const real = realLeft[b];
        if (real <= budgets[b]) {
          budgets[b] -= real;
        } else {
          const excess = real - budgets[b];
          budgets[b] = 0;
          if (b + 1 < SIM_BUCKETS.length) realLeft[b + 1] += excess;
        }
      }
      const gapM = budgets.reduce((s, v) => s + v, 0);
      if (gapM < 1) continue;

      let destroyedFracM = 0;
      for (let bi = 0; bi < SIM_BUCKETS.length; bi++) {
        const [lo, rawHi] = SIM_BUCKETS[bi];
        const hi = Math.min(rawHi, monthCountryMax);
        if (hi <= lo || budgets[bi] <= 0) continue;
        destroyedFracM += (budgets[bi] / gapM) * _analyticFracAbove(threshold, lo, hi);
      }

      // Determine pre/post relative to STRIKE itself (not scEffStrike). The
      // cluster strike happens at strikeDate (function arg, always defined),
      // independent of whether an SC strike accompanies it. Previously this
      // condition used cs.strikeYear; when cs===null (no SC strike) it forced
      // isPreStrike=true for every month, perpetually filtering above-threshold
      // future builds and effectively producing infinite continuous denial in
      // cluster-only scenarios. Manifests when fab strikes are disabled but
      // cluster strikes are enabled.
      const isPreStrike = monthCenter <= strikeDate;
      let surviving;
      if (isPreStrike) {
        // Pre-strike: full month budget, subject to threshold destruction.
        surviving = gapM * (1 - destroyedFracM);
      } else if (continuous && monthCenter <= denialEnd) {
        // Post-strike within denial window: above-threshold builds preempted.
        if (dynDenial) {
          // Dynamic threshold: recompute T_t so pctTarget% of THIS month's
          // budget is destroyed. Threshold drifts with the distribution.
          const dynT = monthlyThresholdForPctDestroyed(country, pctTarget, monthCenter, cs, txEnd);
          let dynFracM = 0;
          for (let bi = 0; bi < SIM_BUCKETS.length; bi++) {
            const [lo, rawHi] = SIM_BUCKETS[bi];
            const hi = Math.min(rawHi, monthCountryMax);
            if (hi <= lo || budgets[bi] <= 0) continue;
            dynFracM += (budgets[bi] / gapM) * _analyticFracAbove(dynT, lo, hi);
          }
          surviving = gapM * (1 - dynFracM);
        } else {
          surviving = gapM * (1 - destroyedFracM);
        }
      } else {
        // Post-strike, no denial: SC-reduced compute survives intact.
        surviving = gapM;
      }
      if (surviving > 0) monthEvents.push({ year: monthCenter, delta: surviving });
    }
  }
  monthEvents.sort((a, b) => a.year - b.year);

  // === Build the time series ===
  // Both realEvents and monthEvents are point events: each event's delta
  // is added to the running total when t crosses event.year. The result is a
  // monotonically increasing surviving-compute timeline (per-month resolution
  // for the analytical contribution; per-cluster-c.year for real clusters).
  const n = Math.ceil((tMax - tMin) / step) + 1;
  const totals = new Float64Array(n);

  let cumReal = 0;
  let ei = 0;
  let cumAna = 0;
  let mi = 0;
  for (let i = 0; i < n; i++) {
    const t = tMin + i * step;
    while (ei < realEvents.length && realEvents[ei].year <= t + 0.05) {
      cumReal += realEvents[ei].delta;
      ei++;
    }
    while (mi < monthEvents.length && monthEvents[mi].year <= t) {
      cumAna += monthEvents[mi].delta;
      mi++;
    }
    totals[i] = cumReal + cumAna;
  }

  return function totalAt(t) {
    if (t <= tMin) return totals[0];
    if (t >= tMax) return totals[n - 1];
    const idx = Math.floor((t - tMin) / step);
    return totals[idx];
  };
}

function generateSimulatedClusters(countryStrikes, transitionEndYear) {
  // countryStrikes: { US: { strikeYear, scFactor, tsmcStrike }, China: { ... }, ... } or null
  // transitionEndYear: by which year shares should fully transition from SHARES_NOW to SHARES_AT_STRIKE.
  //   Pass Infinity (or undefined) to disable the transition entirely.
  const sim = [];
  const countries = Object.keys(SHARES_NOW);
  const txEnd = isFinite(transitionEndYear) ? transitionEndYear : Infinity;
  for (let yi = 1; yi < AIFP_DATA.length; yi++) {
    const [year, globalTotal] = AIFP_DATA[yi];
    const [, prevTotal] = AIFP_DATA[yi - 1];
    const baseNewGlobal = globalTotal - prevTotal;
    if (baseNewGlobal <= 0) continue;

    const rawShares = getNewBuildShares(year);
    const baseGlobalMax = getMaxCluster(year);

    for (const country of countries) {
      // Distribution-shape lag (per-bloc). See BLOC_SHAPE_LAG above.
      const shapeYear = laggedYear(country, year);
      const baseGlobalMaxLagged = getMaxCluster(shapeYear);
      const rawSharesLagged = getCountryShapeShares(country, shapeYear);

      // Per-country SC: US clusters attacked by CN, CN clusters attacked by US
      const cs = countryStrikes && countryStrikes[country];
      // Pro-rate within the strike year: builds before strike proceed at full rate
      // (counterfactual baseNewGlobal), builds after strike scale by baseline_frac
      // (permanent — no recovery). 3-month pipeline delay + 3-month phase-in
      // before post-strike scaling reaches `baseline`.
      let newGlobal = baseNewGlobal;
      let isAnyPostStrike = false;
      let postStrikeFactor = 1.0;
      if (cs && cs.strikeYear != null) {
        const effectiveStrike = cs.strikeYear + SC_PIPELINE_DELAY;
        const preFrac = Math.max(0, Math.min(1, effectiveStrike - year));
        if (preFrac < 1) {
          // Integrate SC factor over the post-strike portion of year Y. Matches
          // analyticalStrikeOutcome / analyticalSurvivingTimeline so the sampler
          // (UI scoreboard) and the analytical (sweep) agree on the gradual
          // 3-month SC ramp.
          const psStart = Math.max(year - effectiveStrike, 0);
          const psEnd = (year + 1) - effectiveStrike;
          postStrikeFactor = avgPostStrikeFactor(country, cs, psStart, psEnd);
          newGlobal = preFrac * baseNewGlobal + (1 - preFrac) * postStrikeFactor * baseNewGlobal;
          isAnyPostStrike = true;
        }
      }

      const effScF = baseNewGlobal > 0 ? newGlobal / baseNewGlobal : 1.0;
      const globalMax = isAnyPostStrike
        ? Math.round(baseGlobalMaxLagged * Math.max(effScF, 0.15))
        : baseGlobalMaxLagged;

      const countryMax = Math.round(globalMax * (simMaxMultFor(country)));
      const buildShares = capBuildShares(rawSharesLagged, countryMax);
      const yearShares = getCountryShares(year, txEnd);
      const newCountry = newGlobal * yearShares[country];
      // Per-bucket sim budgets: subtract each real cluster's incremental
      // compute from the bucket it sits in (overflow spills to next-larger
      // bucket). Avoids the double-counting bug AND distributes the
      // subtraction correctly across bucket sizes.
      const simBucketBudgets = simBudgetsAfterRealSubtraction(country, year, newCountry, buildShares);
      const totalBudget = simBucketBudgets.reduce((s, v) => s + v, 0);
      if (totalBudget < 1000) continue;
      const rng = mulberry32(hashStr(`${country}-${year}-v7`));

      for (let bi = 0; bi < SIM_BUCKETS.length; bi++) {
        let budget = simBucketBudgets[bi];
        const [lo, rawHi] = SIM_BUCKETS[bi];
        const hi = Math.min(rawHi, countryMax);
        if (budget < lo || hi < lo) continue;

        // Generate individual clusters via log-uniform sampling
        while (budget >= lo) {
          const effHi = Math.min(hi, budget * 1.5);
          if (effHi < lo) break;
          const logLo = Math.log(lo), logHi = Math.log(Math.max(effHi, lo * 1.01));
          let size = Math.round(Math.exp(logLo + rng() * (logHi - logLo)));
          size = Math.max(lo, Math.min(size, Math.round(budget), hi));
          if (size < lo) break;
          // Uniform across [Y.0, Y.99]: avoids leaving an empty gap at year boundaries
          // that creates discontinuous behavior in the strike-completion search.
          const yearFrac = year + rng() * 0.99;
          sim.push({
            country, gpus: size, sc: 1,
            name: `Sim-${country}-${year}-${SIM_BUCKET_LABELS[bi].replace(/[^A-Z0-9]/gi,'')}-${sim.length}`,
            year: yearFrac, status: yearFrac <= NOW ? "E" : "P",
            chain: -1, sim: true,
          });
          budget -= size;
        }
      }
    }
  }
  return sim;
}

const SIM_CLUSTERS = generateSimulatedClusters();
const ALL_CLUSTERS = [...CLUSTERS, ...SIM_CLUSTERS];

const LOG2 = Math.log10(2);
const F = n => { if(n>=1e9) return (n/1e9).toFixed(1)+"B"; if(n>=1e6) return (n/1e6).toFixed(1)+"M"; if(n>=1e3) return (n/1e3).toFixed(1)+"K"; return ""+n; };
const H_SEC = 365.25*24*3600;
function halvingToRate(months) { return months >= 600 ? 0 : LOG2/(months/12); }

// === AIFP software-progress model (Medium port) =============================
// Ported from progress_model/progress_rate.py in the AI Futures Project repo.
// Replaces the original `algoSpeedup` saturating-exponential with AIFP's CES
// experiment-capacity function, and adds r_software research-stock dynamics
// (software progress decelerates as research stock accumulates).
// Parameter defaults come from AIFP's model_config.DEFAULT_PARAMETERS.
// research_taste = 1 (no automation feedback) and coding_labor is constant,
// since MAIM doesn't track automated-researcher labor.
const AIFP_DEFAULTS = {
  r_software: 2.40,
  sw_progress_rate_ref: 1.0,            // OOM/yr calibration target at reference_year
  alpha_experiment_capacity: 0.809,
  rho_experiment_capacity: -0.155,
  experiment_compute_exponent: 0.655,
  reference_year: 2025.0,
  coding_labor_baseline: 1.0,
};

// CES: (α·x^ρ + (1-α)·y^ρ)^(1/ρ), Cobb-Douglas limit at ρ→0.
function aifpCes(x, y, alpha, rho) {
  const xs = Math.max(x, 1e-12), ys = Math.max(y, 1e-12);
  if (Math.abs(rho) < 1e-6) return Math.pow(xs, alpha) * Math.pow(ys, 1 - alpha);
  const z = alpha * Math.pow(xs, rho) + (1 - alpha) * Math.pow(ys, rho);
  return Math.pow(Math.max(z, 1e-30), 1 / rho);
}

function aifpResearchEffort(expCompute, codingLabor, p) {
  const discounted = Math.pow(Math.max(expCompute, 1e-12), p.experiment_compute_exponent);
  return aifpCes(discounted, codingLabor, p.alpha_experiment_capacity, p.rho_experiment_capacity);
}

// A(t) = 10^\u222b sw_rate(s) ds, where sw_rate = r_software \u00b7 effort / stock
// and stock(t) = stock(refYear) + \u222b_{refYear}^t effort(s) ds.
// Signature mirrors buildAlgoMultiplier for a drop-in swap.
//
// IMPORTANT: initial research stock is calibrated using the US frontier
// compute at reference_year so that sw_rate_US(refYear) = sw_progress_rate_ref.
// Other countries share that stock0, so countries with less compute produce
// proportionally less effort and therefore a proportionally lower rate \u2014
// the compute gap between countries is preserved. If usBaselineComputeFn is
// null (e.g. called for the US itself), the country's own compute is used,
// which is equivalent for the US.
function buildAifpAlgoMultiplier(companyComputeFn, refCompute, baseRate, diffusion, usBaselineComputeFn, params) {
  const p = { ...AIFP_DEFAULTS, ...(params || {}) };
  const tMin = 2024, tMax = 2042, step = 0.05;
  const n = Math.ceil((tMax - tMin) / step) + 1;
  const refIdx = Math.max(0, Math.round((p.reference_year - tMin) / step));
  const normExp = (raw) => refCompute > 0 ? Math.max(raw / refCompute, 1e-6) : 1;

  // Calibration anchor is ALWAYS the US frontier; all countries share stock0.
  const calibrationFn = usBaselineComputeFn || companyComputeFn;
  const effortUsRef = aifpResearchEffort(normExp(calibrationFn(p.reference_year)), p.coding_labor_baseline, p);
  let stock = p.r_software * effortUsRef / Math.max(p.sw_progress_rate_ref, 1e-6);

  const logA = new Float64Array(n);
  for (let i = refIdx; i < n - 1; i++) {
    const t = tMin + i * step;
    const ownEffort = aifpResearchEffort(normExp(companyComputeFn(t)), p.coding_labor_baseline, p);
    let swRate = p.r_software * ownEffort / Math.max(stock, 1e-12);
    if (diffusion > 0 && usBaselineComputeFn) {
      const usEffort = aifpResearchEffort(normExp(usBaselineComputeFn(t)), p.coding_labor_baseline, p);
      const usRate = p.r_software * usEffort / Math.max(stock, 1e-12);
      swRate = swRate + diffusion * Math.max(0, usRate - swRate);
    }
    logA[i + 1] = logA[i] + swRate * step;
    stock += ownEffort * step;
  }
  return function algoAt(t) {
    if (t <= p.reference_year) return 1;
    if (t >= tMax) return Math.pow(10, logA[n - 1]);
    const idx = Math.min(Math.floor((t - tMin) / step), n - 1);
    return Math.pow(10, logA[Math.max(0, idx)]);
  };
}

function aifpAlgoYearlyMultAt(companyComputeFn, refCompute, baseRate, t, diffusion, usBaselineComputeFn, params) {
  const p = { ...AIFP_DEFAULTS, ...(params || {}) };
  if (t <= p.reference_year) return Math.pow(10, p.sw_progress_rate_ref);
  const A = buildAifpAlgoMultiplier(companyComputeFn, refCompute, baseRate, diffusion, usBaselineComputeFn, p);
  const eps = 0.05;
  const lo = Math.max(p.reference_year, t - eps);
  const rate = (Math.log10(A(t + eps)) - Math.log10(A(lo))) / ((t + eps) - lo);
  return Math.pow(10, Math.max(0, rate));
}
// === end AIFP port ==========================================================

// Interpolate AIFP leading company compute at any year for a given country.
// Algo efficiency scales with company compute, saturating toward AIFP's
// "infinite experiment compute asymptote" of ~1000x.
// At 10x compute: 2.2x speedup (survey). At infinite compute: 1000x (AIFP asymptote).
// Uses a saturating exponential: logMult = maxLogMult × (1 - exp(-k × log10(ratio)))
const ALGO_MAX_SPEEDUP = 1000; // AIFP infinite experiment compute asymptote
const ALGO_MAX_LOG_MULT = Math.log10(ALGO_MAX_SPEEDUP); // 3.0
// Fit k so that 10x compute → 2.2x speedup (log10(2.2) = 0.342)
const ALGO_SAT_K = -Math.log(1 - Math.log10(2.2) / ALGO_MAX_LOG_MULT); // ≈ 0.121

// Saturating speedup: replaces the old unbounded ratio^ε power law
function algoSpeedup(ratio) {
  if (ratio <= 0.01) return 0.01;
  const logRatio = Math.log10(ratio);
  const logMult = ALGO_MAX_LOG_MULT * (1 - Math.exp(-ALGO_SAT_K * logRatio));
  return Math.pow(10, logMult);
}

// Floor: compute-independent progress (conceptual breakthroughs + small-scale engineering)
const ALGO_FLOOR_YEARLY = 1.8; // 1.8x/yr minimum
const ALGO_FLOOR_RATE = Math.log10(ALGO_FLOOR_YEARLY); // ~0.255 OOM/yr

// Build cumulative algo efficiency multiplier A(t).
// companyComputeFn(t): company's total compute at time t (H100-eq)
// refCompute: US leading company's baseline compute at NOW (single global anchor)
// diffusion: 0-1, fraction of gap to US actual rate closed via free-riding on US research
// usBaselineComputeFn: US actual company compute function (including nat/attack effects)
function buildAlgoMultiplier(companyComputeFn, refCompute, baseRate, diffusion, usBaselineComputeFn) {
  if (baseRate <= 0) return (t) => 1;
  const floorRate = Math.min(baseRate, ALGO_FLOOR_RATE);
  const tMin = 2024, tMax = 2042, step = 0.05;
  const n = Math.ceil((tMax - tMin) / step) + 1;
  const logA = new Float64Array(n);

  for (let i = 1; i < n; i++) {
    const t = tMin + i * step;
    if (t <= ALGO_EPOCH) { logA[i] = 0; continue; }
    let effectiveRate;
    if (t <= NOW) {
      effectiveRate = baseRate;
    } else {
      const compute = companyComputeFn(t);
      const ratio = refCompute > 0 ? Math.max(compute / refCompute, 0.01) : 1;
      const ownRate = Math.max(baseRate * algoSpeedup(ratio), floorRate);
      if (diffusion > 0 && usBaselineComputeFn) {
        const usCompute = usBaselineComputeFn(t);
        const usRatio = refCompute > 0 ? Math.max(usCompute / refCompute, 0.01) : 1;
        const usRate = Math.max(baseRate * algoSpeedup(usRatio), floorRate);
        effectiveRate = ownRate + diffusion * Math.max(0, usRate - ownRate);
      } else {
        effectiveRate = ownRate;
      }
    }
    logA[i] = logA[i - 1] + effectiveRate * step;
  }

  return function algoAt(t) {
    if (t <= ALGO_EPOCH) return 1;
    if (t >= tMax) return Math.pow(10, logA[n - 1]);
    const idx = Math.min(Math.floor((t - tMin) / step), n - 1);
    return Math.pow(10, logA[Math.max(0, idx)]);
  };
}

// Compute instantaneous yearly multiplier at a given time for display
function algoYearlyMultAt(companyComputeFn, refCompute, baseRate, t, diffusion, usBaselineComputeFn) {
  if (baseRate <= 0) return 1;
  if (t <= ALGO_EPOCH) return Math.pow(10, baseRate);
  const floorRate = Math.min(baseRate, ALGO_FLOOR_RATE);
  const compute = companyComputeFn(t);
  const ratio = refCompute > 0 ? Math.max(compute / refCompute, 0.01) : 1;
  const ownRate = Math.max(baseRate * algoSpeedup(ratio), floorRate);
  if (diffusion > 0 && usBaselineComputeFn) {
    const usCompute = usBaselineComputeFn(t);
    const usRatio = refCompute > 0 ? Math.max(usCompute / refCompute, 0.01) : 1;
    const usRate = Math.max(baseRate * algoSpeedup(usRatio), floorRate);
    return Math.pow(10, ownRate + diffusion * Math.max(0, usRate - ownRate));
  }
  return Math.pow(10, ownRate);
}

function runTime(gpus, fEff, rate, start, p, eta, u) {
  if(gpus <= 0) return Infinity;
  const dt = Math.max(start - ALGO_EPOCH, 0);
  const aT = Math.pow(10, rate * dt);
  return fEff / (aT * gpus * p * eta * u * H_SEC);
}

function bestCompletion(gpus, availableYear, fEff, rate, p, eta, u, searchFrom) {
  let best = Infinity, bestStart = null;
  const startMin = Math.max(availableYear, searchFrom || NOW);
  for(let s = startMin; s <= 2040; s += 0.02) {
    const done = s + runTime(gpus, fEff, rate, s, p, eta, u);
    if(done < best) { best = done; bestStart = s; }
  }
  return { done: best, start: bestStart };
}

// Pareto-filter phases: keep only those not dominated on both (size, availability).
// A phase is dominated if there exists another with >= gpus AND <= year.
function paretoPhases(phases) {
  const sorted = [...phases].sort((a, b) => b.gpus - a.gpus);
  const result = [];
  let earliestSoFar = Infinity;
  for (const pt of sorted) {
    if (pt.year < earliestSoFar) {
      result.push(pt);
      earliestSoFar = pt.year;
    }
  }
  return result;
}

// Precompute total compute at each time step for a set of sites.
// Returns a function that does O(1) lookup via binary search on sorted events.
function buildComputeTimeline(sites, tMin, tMax, step) {
  // Collect all phase-online events, sorted by year
  const events = [];
  for (const site of sites) {
    // For each site, find the largest phase at each transition point
    const sorted = [...site.phases].sort((a, b) => a.year - b.year);
    let curMax = 0;
    for (const pt of sorted) {
      if (pt.gpus > curMax) {
        events.push({ year: pt.year, delta: pt.gpus - curMax });
        curMax = pt.gpus;
      }
    }
  }
  events.sort((a, b) => a.year - b.year);

  // Build cumulative timeline
  const n = Math.ceil((tMax - tMin) / step) + 1;
  const times = new Float64Array(n);
  const totals = new Float64Array(n);
  let cumul = 0, ei = 0;

  // Start with compute already online at tMin
  for (const site of sites) {
    let siteMax = 0;
    for (const pt of site.phases) {
      if (pt.year <= tMin + 0.05 && pt.gpus > siteMax) siteMax = pt.gpus;
    }
    cumul += siteMax;
  }
  // Subtract events before tMin (they're already counted)
  let eventsBeforeTMin = 0;
  while (ei < events.length && events[ei].year <= tMin + 0.05) {
    eventsBeforeTMin += events[ei].delta;
    ei++;
  }

  for (let i = 0; i < n; i++) {
    const t = tMin + i * step;
    times[i] = t;
    while (ei < events.length && events[ei].year <= t + 0.05) {
      cumul += events[ei].delta;
      ei++;
    }
    totals[i] = cumul;
  }
  // Return lookup: given a time, find the total via index
  return function totalAt(t) {
    if (t <= tMin) return totals[0];
    if (t >= tMax) return totals[n - 1];
    const idx = Math.min(Math.floor((t - tMin) / step), n - 1);
    return totals[idx];
  };
}

// Pre+post training completion with coarse-then-fine sweep.
// Takes preFLOPs and postFLOPs directly (in March 2026 eFLOP units).
function bestCompletionV2(largestGpus, largestAvailable, computeAtFn, preFLOPs, postFLOPs, algoAt, p, eta, u, searchFrom, postScale, preScale) {
  let best = Infinity, bestStart = null, bestPreEnd = null;
  const startMin = Math.max(largestAvailable, searchFrom || NOW);
  const pEtaU = p * eta * u * H_SEC;

  const evalAt = (s) => {
    // Cap pre-training GPUs at company's training allocation budget
    let effGpus = largestGpus;
    if (preScale) {
      const budget = preScale(computeAtFn(s), s);
      effGpus = Math.min(largestGpus, budget);
    }
    if (effGpus <= 0) return { done: Infinity };
    const preEff = algoAt(s);
    const preTime = preFLOPs > 0 ? preFLOPs / (preEff * effGpus * pEtaU) : 0;
    const postStart = s + preTime;
    let totalGpus = computeAtFn(postStart);
    if (postScale) totalGpus = postScale(totalGpus, postStart);
    if (totalGpus <= 0) return { done: Infinity };
    const postEff = algoAt(postStart);
    const postTime = postFLOPs > 0 ? postFLOPs / (postEff * totalGpus * pEtaU) : 0;
    return { done: postStart + postTime, preEnd: postStart, effGpus };
  };

  // Coarse sweep: 0.25-year steps
  let coarseBestS = startMin;
  for (let s = startMin; s <= 2040; s += 0.25) {
    const r = evalAt(s);
    if (r.done < best) { best = r.done; bestStart = s; bestPreEnd = r.preEnd; coarseBestS = s; }
  }

  // Fine sweep: 0.02-year steps around the coarse best
  const fineMin = Math.max(startMin, coarseBestS - 0.5);
  const fineMax = Math.min(2040, coarseBestS + 0.5);
  for (let s = fineMin; s <= fineMax; s += 0.02) {
    const r = evalAt(s);
    if (r.done < best) { best = r.done; bestStart = s; bestPreEnd = r.preEnd; }
  }

  return { done: best, start: bestStart, preEnd: bestPreEnd };
}

// Animated progress bar that fills asymptotically toward 95% while `isLoading`,
// then snaps to 100% briefly when the request completes and fades back to 0.
// Gives visual feedback during the AIFP backend request without claiming a
// specific completion percentage we can't actually measure.
function LoadingBar({ isLoading }) {
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    if (!isLoading) {
      // On transition out of loading, briefly show 100% then reset to 0.
      setProgress(p => (p > 0 ? 1 : 0));
      const t = setTimeout(() => setProgress(0), 350);
      return () => clearTimeout(t);
    }
    // On loading start, animate from 0 → 95% asymptotically over ~3s.
    const start = Date.now();
    let raf = 0;
    let alive = true;
    const tau = 1.6; // seconds; controls fill speed
    const tick = () => {
      if (!alive) return;
      const elapsed = (Date.now() - start) / 1000;
      const target = 0.95 * (1 - Math.exp(-elapsed / tau));
      setProgress(target);
      raf = requestAnimationFrame(tick);
    };
    setProgress(0.04);
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isLoading]);
  return (
    <div style={{ height:4, marginTop:6, background:"#1e293b", borderRadius:2, overflow:"hidden" }}>
      <div style={{
        height:"100%",
        width: `${progress * 100}%`,
        background: "linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)",
        transition: !isLoading ? "width 250ms ease-out" : "width 80ms linear",
      }} />
    </div>
  );
}

function Slider({ label, hint, value, onChange, min, max, step, format, logScale }) {
  const disp = format ? format(value) : value;
  const handle = e => {
    const raw = parseFloat(e.target.value);
    let val = logScale ? Math.pow(10, raw) : raw;
    if (logScale && step && step > 0) {
      val = Math.round(val / step) * step;
      val = Math.max(min, Math.min(max, val));
    } else if (logScale) {
      val = Math.round(val);
    }
    onChange(val);
  };
  const sv = logScale ? Math.log10(Math.max(value,1)) : value;
  const smin = logScale ? Math.log10(Math.max(min,1)) : min;
  const smax = logScale ? Math.log10(max) : max;
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:3 }}>
        <span style={{ fontSize:11, color:"#94a3b8", fontFamily:"var(--f)", textTransform:"uppercase", letterSpacing:0.6 }}>{label}</span>
        <span style={{ fontSize:14, color:"#e2e8f0", fontFamily:"var(--f)", fontWeight:600 }}>{disp}</span>
      </div>
      <input type="range" min={smin} max={smax} step={logScale?0.01:step} value={sv} onChange={handle}
        style={{ width:"100%", accentColor:"#ef4444" }} />
      {hint && <div style={{ fontSize:10, color:"#475569", marginTop:2, lineHeight:1.4 }}>{hint}</div>}
    </div>
  );
}
function Btn({active,onClick,children}) {
  return <button onClick={onClick} style={{
    fontSize:11, padding:"4px 10px", background:active?"#1e3a5f":"#0f172a",
    border:`1px solid ${active?"#2563eb":"#1e293b"}`, borderRadius:4,
    color:active?"#e2e8f0":"#64748b", cursor:"pointer", fontFamily:"var(--f)",
  }}>{children}</button>;
}
function MetricBox({label,value,sub,warn,good,highlight}) {
  return (
    <div style={{
      background: highlight ? "rgba(99,102,241,0.12)" : "rgba(30,41,59,0.6)",
      borderRadius:6, padding: highlight ? "10px 12px" : "8px 10px",
      borderLeft:`3px solid ${highlight ? "#818cf8" : warn?"#ef4444":good?"#22c55e":"#334155"}`,
      border: highlight ? "1px solid #818cf840" : undefined,
      flex:1, minWidth:120,
    }}>
      <div style={{ fontSize:10, color: highlight ? "#a5b4fc" : "#64748b", fontFamily:"var(--f)", textTransform:"uppercase", letterSpacing:0.6 }}>{label}</div>
      <div style={{ fontSize: highlight ? 20 : 17, fontWeight:700, fontFamily:"var(--f)", color: highlight ? "#c7d2fe" : warn?"#ef4444":good?"#22c55e":"#e2e8f0", marginTop:2 }}>{value}</div>
      {sub && <div style={{ fontSize:10, color: highlight ? "#6366f1" : "#475569", fontFamily:"var(--f)", marginTop:1 }}>{sub}</div>}
    </div>
  );
}

// Render the per-country milestone timeline to a canvas context. Used both by the
// embedded chart (dark theme) and the PNG export (light theme).
function renderMilestoneTimelineCanvas(ctx, W, H, opts) {
  const { usS, cnS, strikeUsDate, strikeCnDate, theme = "dark", showHeader = false, headerText = "" } = opts;
  const T = theme === "dark" ? {
    bg: "transparent", text: "#e2e8f0", textSubtle: "#94a3b8", grid: "#1e293b",
    panelBorder: "#334155", usColor: "#60a5fa", cnColor: "#fbbf24",
    atkColor: "#f87171", strikeColor: "#94a3b8", arrowColor: "#cbd5e1",
    labelText: "#cbd5e1",
  } : {
    bg: "#ffffff", text: "#1e293b", textSubtle: "#475569", grid: "#e2e8f0",
    panelBorder: "#cbd5e1", usColor: "#3b82f6", cnColor: "#d97706",
    atkColor: "#dc2626", strikeColor: "#475569", arrowColor: "#475569",
    labelText: "#1e293b",
  };
  if (T.bg !== "transparent") { ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H); }

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmtDate = (y) => {
    if (!isFinite(y) || y > 2050) return ">2050";
    const yr = Math.floor(y), mo = Math.round((y - yr) * 12);
    return `${MONTHS[Math.min(mo, 11)]} ${yr}`;
  };

  let topPad = 36;
  if (showHeader && headerText) {
    ctx.fillStyle = T.text;
    ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(headerText, W / 2, 24);
    topPad = 48;
  }

  const panels = [
    { country: "US", color: T.usColor, s: usS, strike: strikeCnDate, x0: 24, title: "United States — capability arrival under CN strike" },
    { country: "China", color: T.cnColor, s: cnS, strike: strikeUsDate, x0: W / 2 + 6, title: "China — capability arrival under US strike" },
  ];
  const panelW = W / 2 - 30;

  panels.forEach(panel => {
    const baseDates = MILESTONES.map(m => panel.s.milestoneDates?.[m.key] ?? null);
    const atkDates  = MILESTONES.map(m => panel.s.milestoneDatesAttack?.[m.key] ?? null);
    const allDates = [...baseDates, ...atkDates].filter(d => d != null && isFinite(d));
    if (allDates.length === 0) return;
    const xMin = Math.min(...allDates) - 0.3;
    const xMax = Math.max(...allDates) + 0.5;
    const eflops = MILESTONES.map(m => Math.pow(10, m.feb2025Log10));
    const yLogMin = Math.log10(Math.min(...eflops)) - 0.4;
    const yLogMax = Math.log10(Math.max(...eflops)) + 0.4;

    const PL = panel.x0 + 60, PR = panel.x0 + panelW - 18, PT = topPad + 22, PB = H - 38;
    const xToPx = (x) => PL + (x - xMin) / (xMax - xMin) * (PR - PL);
    const yToPx = (y) => PB - (Math.log10(y) - yLogMin) / (yLogMax - yLogMin) * (PB - PT);

    ctx.fillStyle = T.text;
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(panel.title, (PL + PR) / 2, PT - 8);

    // Y gridlines + labels at decade boundaries
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    for (let exp = Math.ceil(yLogMin); exp <= Math.floor(yLogMax); exp++) {
      const py = yToPx(Math.pow(10, exp));
      ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PL, py); ctx.lineTo(PR, py); ctx.stroke();
      ctx.fillStyle = T.textSubtle;
      ctx.fillText(`10^${exp}`, PL - 5, py + 3);
    }

    // X gridlines + year labels
    ctx.textAlign = "center";
    for (let yr = Math.ceil(xMin); yr <= Math.floor(xMax); yr++) {
      const px = xToPx(yr);
      ctx.strokeStyle = T.grid;
      ctx.beginPath(); ctx.moveTo(px, PT); ctx.lineTo(px, PB); ctx.stroke();
      ctx.fillStyle = T.textSubtle;
      ctx.fillText(`${yr}`, px, PB + 14);
    }

    // Plot border
    ctx.strokeStyle = T.panelBorder; ctx.lineWidth = 1.2;
    ctx.strokeRect(PL, PT, PR - PL, PB - PT);

    // Strike vertical line
    if (panel.strike != null && isFinite(panel.strike) && panel.strike >= xMin && panel.strike <= xMax) {
      const sx = xToPx(panel.strike);
      ctx.strokeStyle = T.strikeColor;
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sx, PT); ctx.lineTo(sx, PB); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = T.strikeColor;
      ctx.font = "10px system-ui"; ctx.textAlign = "left";
      ctx.fillText(" Strike", sx + 2, PT + 10);
    }

    // Baseline line + points
    ctx.strokeStyle = panel.color; ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    baseDates.forEach((d, i) => {
      if (d == null || !isFinite(d)) return;
      const px = xToPx(d), py = yToPx(eflops[i]);
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    });
    ctx.stroke();
    baseDates.forEach((d, i) => {
      if (d == null || !isFinite(d)) return;
      const px = xToPx(d), py = yToPx(eflops[i]);
      ctx.fillStyle = panel.color;
      ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = T.labelText;
      ctx.font = "bold 10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(MILESTONES[i].label, px - 7, py - 6);
    });

    // Post-strike line (dashed, forks at strike date)
    let strikeY = null;
    for (let i = 0; i < baseDates.length - 1; i++) {
      if (baseDates[i] != null && baseDates[i + 1] != null && baseDates[i] < panel.strike && baseDates[i + 1] >= panel.strike) {
        const f = (panel.strike - baseDates[i]) / (baseDates[i + 1] - baseDates[i]);
        strikeY = Math.pow(10, Math.log10(eflops[i]) + f * (Math.log10(eflops[i + 1]) - Math.log10(eflops[i])));
        break;
      }
    }
    const atkPathPts = [];
    if (strikeY != null) atkPathPts.push([panel.strike, strikeY]);
    atkDates.forEach((d, i) => {
      if (d == null || !isFinite(d)) return;
      if (d > panel.strike) atkPathPts.push([d, eflops[i]]);
    });
    if (atkPathPts.length >= 2) {
      ctx.strokeStyle = T.atkColor;
      ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
      ctx.beginPath();
      atkPathPts.forEach(([x, y], i) => {
        const px = xToPx(x), py = yToPx(y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    atkDates.forEach((d, i) => {
      if (d == null || !isFinite(d) || d <= panel.strike) return;
      const px = xToPx(d), py = yToPx(eflops[i]);
      ctx.fillStyle = T.atkColor;
      ctx.fillRect(px - 4, py - 4, 8, 8);
    });

    // Delay arrows + labels
    ctx.strokeStyle = T.arrowColor;
    ctx.fillStyle = T.arrowColor;
    ctx.lineWidth = 1.2;
    ctx.font = "bold 10px system-ui";
    ctx.textAlign = "center";
    baseDates.forEach((bd, i) => {
      const ad = atkDates[i];
      if (bd == null || ad == null || !isFinite(ad) || (ad - bd) <= 0.04) return;
      const py = yToPx(eflops[i]);
      const bx = xToPx(bd), ax = xToPx(ad);
      ctx.beginPath(); ctx.moveTo(bx, py); ctx.lineTo(ax, py); ctx.stroke();
      const head = 5;
      ctx.beginPath();
      ctx.moveTo(ax, py); ctx.lineTo(ax - head, py - head / 2); ctx.lineTo(ax - head, py + head / 2);
      ctx.closePath(); ctx.fill();
      const dly = ad - bd;
      ctx.fillText(`+${dly.toFixed(1)} yr`, (bx + ax) / 2, py - 5);
    });

    // Y axis label
    ctx.save();
    ctx.translate(panel.x0 + 12, (PT + PB) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = T.textSubtle;
    ctx.font = "10px system-ui";
    ctx.fillText("Effective FLOP at milestone", 0, 0);
    ctx.restore();
  });
}

// Embedded React wrapper: renders the dark-themed milestone timeline chart.
function MilestoneTimelineChart({ usS, cnS, strikeUsDate, strikeCnDate }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // Use device pixel ratio for crispness
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = 1600, H = 480;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.display = "block";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderMilestoneTimelineCanvas(ctx, W, H, { usS, cnS, strikeUsDate, strikeCnDate, theme: "dark" });
  }, [usS, cnS, strikeUsDate, strikeCnDate]);
  return <canvas ref={ref} />;
}

function Chart({ points, chainLinks, chainMembers, usAtkThreshold, cnAtkThreshold, usAtkStrikeDate, cnAtkStrikeDate, usAtkPreempt, cnAtkPreempt, usAtkDenialYears, cnAtkDenialYears, trainingRuns, width, height }) {
  // Each dot's threshold depends on who attacks it
  const thresholdFor = (country) => country === "China" ? usAtkThreshold : country === "US" || country === "Ally" ? cnAtkThreshold : 1e11;
  const strikeDateFor = (country) => country === "China" ? usAtkStrikeDate : country === "US" || country === "Ally" ? cnAtkStrikeDate : NOW;
  const preemptFor = (country) => country === "China" ? usAtkPreempt : country === "US" || country === "Ally" ? cnAtkPreempt : false;
  // A cluster is DESTROYED if it's above threshold and operational by the strike date.
  // (Year vs strike date — a "planned" cluster that comes online before the strike is
  // still destroyed by the strike, not preempted.)
  const isDestroyed = (pt) => pt.gpus >= thresholdFor(pt.country) && pt.year <= strikeDateFor(pt.country) + 0.05;
  const starPath = (cx, cy, r) => {
    const pts = 4, inner = r * 0.38;
    let d = '';
    for (let i = 0; i < pts * 2; i++) {
      const angle = (Math.PI / pts) * i - Math.PI / 2;
      const radius = i % 2 === 0 ? r : inner;
      d += `${i === 0 ? 'M' : 'L'}${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
    }
    return d + 'Z';
  };
  const [hovered, setHovered] = useState(null);
  const hoveredChain = hovered !== null && points[hovered].chain >= 0 ? points[hovered].chain : null;
  // Chains with at least one phase that's destroyed at strike (i.e., site
  // already crosses threshold pre-strike). Post-strike phases of these chains
  // are NOT preempted in the calculation — the site was already destroyed —
  // so they shouldn't get the preempted visual either.
  const preStrikeDestroyedChains = useMemo(() => {
    const s = new Set();
    points.forEach(pt => { if(pt.chain >= 0 && isDestroyed(pt)) s.add(pt.chain); });
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, usAtkThreshold, cnAtkThreshold, usAtkStrikeDate, cnAtkStrikeDate]);
  // Per-country denial window: continuous denial actively prevents new
  // above-threshold builds for `denialYears` after the strike. Clusters
  // arriving after the window proceed normally and aren't marked preempted.
  const denialYearsFor = (country) => country === "China" ? usAtkDenialYears : (cnAtkDenialYears ?? 1);
  const preemptCutoffFor = (country) => strikeDateFor(country) + (denialYearsFor(country) ?? 1);
  // A cluster is PREEMPTED only if preempt is on, it's above threshold, comes
  // online AFTER the strike but BEFORE the post-strike training finishes, AND
  // its chain wasn't already destroyed pre-strike.
  const isPreempted = (pt) => {
    if (!preemptFor(pt.country)) return false;
    if (pt.gpus < thresholdFor(pt.country)) return false;
    if (pt.year <= strikeDateFor(pt.country) + 0.05) return false;
    if (pt.year > preemptCutoffFor(pt.country) + 0.05) return false;
    if (pt.chain >= 0 && preStrikeDestroyedChains.has(pt.chain)) return false;
    return true;
  };
  const isSab = (pt) => isDestroyed(pt) || isPreempted(pt);
  const sabChains = useMemo(() => {
    const s = new Set();
    points.forEach(pt => { if(pt.chain >= 0 && isSab(pt)) s.add(pt.chain); });
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, usAtkThreshold, cnAtkThreshold, usAtkStrikeDate, cnAtkStrikeDate, usAtkPreempt, cnAtkPreempt, usAtkDenialYears, cnAtkDenialYears, preStrikeDestroyedChains]);
  const mg = { top:25, right:30, bottom:50, left:70 };
  const w = width-mg.left-mg.right, h = height-mg.top-mg.bottom;
  const xMin=2022, xMax=2035.99, yMin=800, yMax=200000000;
  const xS = v => ((v-xMin)/(xMax-xMin))*w;
  const yS = v => {
    const c = Math.max(Math.min(v,yMax),yMin);
    return h-((Math.log10(c)-Math.log10(yMin))/(Math.log10(yMax)-Math.log10(yMin)))*h;
  };
  const xTicks = [2022,2024,2026,2028,2030,2032,2034,2035];
  const yTicks = [1000,5000,10000,50000,100000,500000,1000000,5000000,10000000,50000000,100000000];

  return (
    <div style={{ overflowX:"auto" }}>
      <svg width={width} height={height} style={{ display:"block" }}>
        <defs>
          <linearGradient id="dz" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.07"/>
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.01"/>
          </linearGradient>
          <style>{`
            @keyframes sabPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 0.25; } }
            @keyframes glowPulse { 0%,100% { opacity: 0.14; } 50% { opacity: 0.04; } }
            @keyframes linkPulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.1; } }
            .sab-pulse { animation: sabPulse 2.5s ease-in-out infinite; }
            .glow-pulse { animation: glowPulse 2.5s ease-in-out infinite; }
            .link-pulse { animation: linkPulse 2.5s ease-in-out infinite; }
          `}</style>
        </defs>
        <g transform={`translate(${mg.left},${mg.top})`}>
          {yS(Math.min(usAtkThreshold, cnAtkThreshold))>0 && <rect x={0} y={0} width={w} height={Math.max(yS(Math.min(usAtkThreshold, cnAtkThreshold)),0)} fill="url(#dz)"/>}
          {yTicks.map(t=>(
            <g key={`y${t}`}>
              <line x1={0} y1={yS(t)} x2={w} y2={yS(t)} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="4,4" opacity={0.5}/>
              <text x={-8} y={yS(t)+3.5} textAnchor="end" fill="#64748b" fontSize={9} fontFamily="var(--f)">{F(t)}</text>
            </g>
          ))}
          {xTicks.map(t=>(
            <g key={`x${t}`}>
              <line x1={xS(t)} y1={0} x2={xS(t)} y2={h} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="4,4" opacity={0.4}/>
              <text x={xS(t)} y={h+16} textAnchor="middle" fill="#64748b" fontSize={10} fontFamily="var(--f)">{t}</text>
            </g>
          ))}
          <line x1={xS(NOW)} y1={0} x2={xS(NOW)} y2={h} stroke="#64748b" strokeWidth={1} strokeDasharray="3,3" opacity={0.4}/>
          <text x={xS(NOW)+4} y={12} fill="#64748b" fontSize={8} fontFamily="var(--f)">Present</text>
          {cnAtkStrikeDate > NOW + 0.1 && <>
            <line x1={xS(cnAtkStrikeDate)} y1={0} x2={xS(cnAtkStrikeDate)} y2={h} stroke="#d97706" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.4}/>
            <text x={xS(cnAtkStrikeDate)+4} y={12} fill="#d97706" fontSize={8} fontFamily="var(--f)" fontWeight={600}>CN{"\u2192"}US</text>
          </>}
          {usAtkStrikeDate > NOW + 0.1 && <>
            <line x1={xS(usAtkStrikeDate)} y1={0} x2={xS(usAtkStrikeDate)} y2={h} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.4}/>
            <text x={xS(usAtkStrikeDate)+4} y={24} fill="#3b82f6" fontSize={8} fontFamily="var(--f)" fontWeight={600}>US{"\u2192"}CN</text>
          </>}
          {cnAtkThreshold < 1e10 && <>
            <line x1={0} y1={yS(cnAtkThreshold)} x2={w} y2={yS(cnAtkThreshold)} stroke="#d97706" strokeWidth={1.5} strokeDasharray="8,4" opacity={0.5} style={{animation:"sabPulse 3s ease-in-out infinite"}}/>
            <text x={w+4} y={yS(cnAtkThreshold)-4} fill="#d97706" fontSize={8} fontFamily="var(--f)" fontWeight={600}>CN{"\u2192"}US</text>
          </>}
          {usAtkThreshold < 1e10 && <>
            <line x1={0} y1={yS(usAtkThreshold)} x2={w} y2={yS(usAtkThreshold)} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="8,4" opacity={0.5} style={{animation:"sabPulse 3s ease-in-out infinite"}}/>
            <text x={w+4} y={yS(usAtkThreshold)+12} fill="#3b82f6" fontSize={8} fontFamily="var(--f)" fontWeight={600}>US{"\u2192"}CN</text>
          </>}

          {chainLinks.map((link,li) => {
            const jyF = ((link.from.idx*7+link.from.idx*link.from.idx*3)%9-4)*1.2;
            const jyT = ((link.to.idx*7+link.to.idx*link.to.idx*3)%9-4)*1.2;
            const x1c=xS(link.from.year), y1c=yS(link.from.gpus)+jyF;
            const x2c=xS(link.to.year), y2c=yS(link.to.gpus)+jyT;
            const lCol=link.from.country==="US"?"#3b82f6":link.from.country==="China"?"#d97706":link.from.country==="Ally"?"#22c55e":"#8b5cf6";
            const isChainHovered = hoveredChain !== null && link.from.chain === hoveredChain;
            const isChainSab = sabChains.has(link.from.chain);
            const sabLCol = link.from.country==="US"?"#ef4444":link.from.country==="China"?"#f97316":"#ef4444";
            return <line key={`cl${li}`} x1={x1c} y1={y1c} x2={x2c} y2={y2c}
              stroke={isChainSab?sabLCol:lCol} strokeWidth={isChainHovered?1.5:isChainSab?1:0.7}
              opacity={isChainHovered?0.6:isChainSab?0.3:0.2}
              strokeDasharray={isChainHovered?"none":"2,2"}
              className={isChainSab&&!isChainHovered?"link-pulse":undefined}/>;
          })}

          {points.map((pt,i)=>{
            const cx=xS(pt.year), cy=yS(pt.gpus);
            const destroyed=isDestroyed(pt);
            const preempted=isPreempted(pt);
            const sab=destroyed||preempted;
            const chainSab = pt.chain >= 0 && sabChains.has(pt.chain);
            const targeted = sab || chainSab;
            const est=pt.name.includes("[EST]");
            const col=pt.country==="US"?"#3b82f6":pt.country==="China"?"#d97706":pt.country==="Ally"?"#22c55e":"#8b5cf6";
            const sabCol=pt.country==="US"?"#ef4444":pt.country==="China"?"#f97316":pt.country==="Ally"?"#16a34a":"#7c3aed";
            const isH=hovered===i;
            const isChainSibling = !isH && hoveredChain !== null && pt.chain === hoveredChain;
            const planned=pt.status==="P"; // pre-NOW vs post-NOW (drives non-sab visual: faded for planned)
            const jy=((i*7+i*i*3)%9-4)*1.2;
            if(cy<-10||cy>h+10) return null;
            const interactive = pt.topTier;
            return (
              <g key={i}
                onMouseEnter={interactive ? () => setHovered(i) : undefined}
                onMouseLeave={interactive ? () => setHovered(null) : undefined}
                style={interactive ? {cursor:"pointer"} : undefined}>
                {isH && <circle cx={cx} cy={cy+jy} r={14} fill={col} opacity={0.12}/>}
                {isChainSibling && <circle cx={cx} cy={cy+jy} r={10} fill={col} opacity={0.15} stroke={col} strokeWidth={1} strokeDasharray="2,1"/>}
                {targeted && !isH && !pt.sim && <circle cx={cx} cy={cy+jy} r={10} fill={sabCol} opacity={0.14} className="glow-pulse"/>}
                {pt.sim ? (
                  <path d={starPath(cx, cy+jy, sab?5:Math.min(3+Math.log10(pt.gpus)*0.5,6.5))}
                    fill={sab?"#1e293b":col}
                    stroke={sab?sabCol:col}
                    strokeWidth={sab?1.5:0.6}
                    opacity={destroyed?0.3:preempted?0.2:planned?0.4:0.6}/>
                ) : est && !sab ? (
                  <rect x={cx-4} y={cy+jy-4} width={8} height={8} rx={1.5}
                    fill={col}
                    stroke={planned?col:"none"}
                    strokeWidth={planned?1:0}
                    strokeDasharray={planned?"3,2":"none"}
                    opacity={planned?0.5:0.7}
                    transform={`rotate(45,${cx},${cy+jy})`}/>
                ) : (
                  <circle cx={cx} cy={cy+jy}
                    r={sab?4:Math.min(2.5+Math.log10(pt.gpus)*0.6,7)}
                    fill={sab?"#1e293b":col}
                    stroke={sab?sabCol:planned?col:"none"}
                    strokeWidth={sab?1.5:planned?1:0}
                    strokeDasharray={preempted?"3,2":!sab&&planned?"3,2":"none"}
                    opacity={destroyed?0.3:preempted?0.2:planned?0.6:0.85}/>
                )}
                {preempted&&<g className="sab-pulse">
                  <circle cx={cx} cy={cy+jy} r={5} fill="none" stroke={sabCol} strokeWidth={1.2}/>
                  <line x1={cx-3.5} y1={cy+jy+3.5} x2={cx+3.5} y2={cy+jy-3.5} stroke={sabCol} strokeWidth={1.2}/>
                </g>}
                {chainSab&&!sab&&<g className="sab-pulse">
                  <line x1={cx-2.5} y1={cy+jy-2.5} x2={cx+2.5} y2={cy+jy+2.5} stroke={sabCol} strokeWidth={1} opacity={0.5}/>
                  <line x1={cx+2.5} y1={cy+jy-2.5} x2={cx-2.5} y2={cy+jy+2.5} stroke={sabCol} strokeWidth={1} opacity={0.5}/>
                </g>}
              </g>
            );
          })}

          {hovered!==null&&(()=>{
            const pt=points[hovered];
            const cx=xS(pt.year),jy=((hovered*7+hovered*hovered*3)%9-4)*1.2;
            const cy=yS(pt.gpus)+jy;
            const sab=isSab(pt);
            const chainSab2 = pt.chain >= 0 && sabChains.has(pt.chain) && !sab;
            const est=pt.name.includes("[EST]");
            const sabCol2=pt.country==="US"?"#ef4444":pt.country==="China"?"#f97316":pt.country==="Ally"?"#16a34a":"#7c3aed";
            const tw=240,th=est?64:pt.sim?64:chainSab2?64:52;
            const tx=cx+tw+20>w?cx-tw-12:cx+12;
            const ty=Math.max(0,Math.min(cy-th/2,h-th));
            return (
              <g>
                <rect x={tx} y={ty} width={tw} height={th} rx={4} fill="#0f172a" stroke="#334155" strokeWidth={1} opacity={0.95}/>
                <text x={tx+8} y={ty+15} fill="#e2e8f0" fontSize={11} fontFamily="var(--f)" fontWeight={600}>{pt.name.replace(" [EST]","")}</text>
                <text x={tx+8} y={ty+29} fill="#94a3b8" fontSize={10} fontFamily="var(--f)">
                  {F(pt.gpus)} H100-eq {"\u00B7"} {pt.country} {"\u00B7"} {pt.status==="P"?"Planned":"Existing"}
                </text>
                <text x={tx+8} y={ty+43} fill={sab||chainSab2?sabCol2:"#94a3b8"} fontSize={10} fontFamily="var(--f)">
                  {isDestroyed(pt)?"DISABLED":isPreempted(pt)?"PREEMPTED":chainSab2?"ELIMINATED (same site)":` Online ~${pt.year.toFixed(1)}`}
                </text>
                {est && <text x={tx+8} y={ty+57} fill="#f59e0b" fontSize={9} fontFamily="var(--f)">ESTIMATE (not in Epoch dataset)</text>}
                {pt.sim && !pt.repCount && <text x={tx+8} y={ty+57} fill="#818cf8" fontSize={9} fontFamily="var(--f)">SIMULATED</text>}
                {pt.sim && pt.repCount && <text x={tx+8} y={ty+57} fill="#818cf8" fontSize={9} fontFamily="var(--f)">{`SIMULATED: ~${pt.repCount} sites, ${F(pt.repTotal)} total`}</text>}
              </g>
            );
          })()}
          <text x={w/2} y={h+40} textAnchor="middle" fill="#475569" fontSize={11} fontFamily="var(--f)">Year</text>
          <text x={-h/2} y={-55} textAnchor="middle" fill="#475569" fontSize={11} fontFamily="var(--f)" transform="rotate(-90)">Cluster size (H100-equivalents)</text>
        </g>
      </svg>
    </div>
  );
}

function LI({color,label,dashed,crossed,crossedDashed,diamond}){
  if(crossedDashed) return <div style={{display:"flex",alignItems:"center",gap:5}}>
    <svg width={12} height={12} viewBox="0 0 12 12">
      <circle cx={6} cy={6} r={4} fill="none" stroke={color} strokeWidth={1.2} opacity={0.5}/>
      <line x1={2.5} y1={9.5} x2={9.5} y2={2.5} stroke={color} strokeWidth={1.2} opacity={0.5}/>
    </svg>
    <span style={{fontSize:11,color:"#64748b",fontFamily:"var(--f)"}}>{label}</span>
  </div>;
  return <div style={{display:"flex",alignItems:"center",gap:5}}>
    {diamond ? (
      <div style={{width:8,height:8,transform:"rotate(45deg)",background:color,opacity:0.7,borderRadius:1.5}}/>
    ) : (
      <div style={{width:10,height:10,borderRadius:"50%",background:crossed?"#1e293b":dashed?"transparent":color,border:crossed?`1.5px solid ${color}`:dashed?`1.5px dashed ${color}`:"none",opacity:crossed?0.5:dashed?0.6:0.85}}/>
    )}
    <span style={{fontSize:11,color:"#64748b",fontFamily:"var(--f)"}}>{label}</span>
  </div>;
}

// --- Small stat display for projection panels ---
function StatItem({ label, value, color, sub }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, color: "#64748b", fontFamily: "var(--f)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--f)", color: color || "#e2e8f0", marginTop: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#475569", fontFamily: "var(--f)", marginTop: 0 }}>{sub}</div>}
    </div>
  );
}

// --- Projection line charts for compute growth & algorithmic efficiency ---
function ProjectionChart({ title, subtitle, series, xMin, xMax, yMin, yMax, logY, width, height, yLabel, yFormat, xTicks: xTicksProp, yTicks: yTicksProp, nowLine, strikeLines }) {
  const mg = { top: 30, right: 24, bottom: 48, left: 80 };
  const w = width - mg.left - mg.right, h = height - mg.top - mg.bottom;
  const xS = v => ((v - xMin) / (xMax - xMin)) * w;
  const yS = v => {
    const c = Math.max(Math.min(v, yMax), yMin);
    if (logY) {
      return h - ((Math.log10(c) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))) * h;
    }
    return h - ((c - yMin) / (yMax - yMin)) * h;
  };
  const xTicks = xTicksProp || Array.from({ length: xMax - xMin + 1 }, (_, i) => xMin + i);
  const yTicks = yTicksProp || [];
  const fmt = yFormat || F;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        <g transform={`translate(${mg.left},${mg.top})`}>
          {/* Title */}
          <text x={0} y={-14} fill="#94a3b8" fontSize={13} fontFamily="var(--f)" fontWeight={600}>{title}</text>
          {subtitle && <text x={0} y={-2} fill="#475569" fontSize={10} fontFamily="var(--f)">{subtitle}</text>}

          {/* Grid */}
          {yTicks.map(t => (
            <g key={`y${t}`}>
              <line x1={0} y1={yS(t)} x2={w} y2={yS(t)} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="4,4" opacity={0.5} />
              <text x={-8} y={yS(t) + 3.5} textAnchor="end" fill="#64748b" fontSize={9} fontFamily="var(--f)">{fmt(t)}</text>
            </g>
          ))}
          {xTicks.map(t => (
            <g key={`x${t}`}>
              <line x1={xS(t)} y1={0} x2={xS(t)} y2={h} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="4,4" opacity={0.4} />
              <text x={xS(t)} y={h + 16} textAnchor="middle" fill="#64748b" fontSize={10} fontFamily="var(--f)">{t}</text>
            </g>
          ))}
          {nowLine && (
            <>
              <line x1={xS(NOW)} y1={0} x2={xS(NOW)} y2={h} stroke="#64748b" strokeWidth={1} strokeDasharray="3,3" opacity={0.4} />
              <text x={xS(NOW) + 4} y={12} fill="#64748b" fontSize={8} fontFamily="var(--f)">Now</text>
            </>
          )}
          {strikeLines && strikeLines.map((sl, i) => (
            sl.date > xMin && sl.date < xMax && <g key={i}>
              <line x1={xS(sl.date)} y1={0} x2={xS(sl.date)} y2={h} stroke={sl.color} strokeWidth={1.5} strokeDasharray="5,3" opacity={0.5} />
              <text x={xS(sl.date) + 3} y={i * 12 + 22} fill={sl.color} fontSize={7} fontFamily="var(--f)" fontWeight={600} opacity={0.7}>{sl.label}</text>
            </g>
          ))}

          {/* Zero baseline (only when y range crosses zero) */}
          {!logY && yMin < 0 && yMax > 0 && (
            <line x1={0} y1={yS(0)} x2={w} y2={yS(0)} stroke="#64748b" strokeWidth={1} opacity={0.5} />
          )}

          {/* Series paths/bars */}
          {series.map((s, si) => {
            if (s.bars) {
              const pts = s.data.filter(([x, y]) => x >= xMin && x <= xMax && isFinite(y));
              if (!pts.length) return null;
              const zeroY = yS(0);
              const barW = s.barWidth || 6;
              return (
                <g key={si}>
                  {pts.map(([x, y], i) => {
                    const cx = xS(x);
                    const ty = y >= 0 ? yS(y) : zeroY;
                    const bh = Math.max(1, Math.abs(yS(y) - zeroY));
                    return (
                      <rect key={i} x={cx - barW / 2} y={ty} width={barW} height={bh}
                        fill={s.color} opacity={s.dashed ? 0.45 : 0.85} />
                    );
                  })}
                </g>
              );
            }
            const pts = s.data.filter(([x, y]) => x >= xMin && x <= xMax && (!logY || y > 0));
            if (pts.length < 2) return null;
            const pathD = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${xS(x).toFixed(1)},${yS(y).toFixed(1)}`).join(" ");

            // Area fill
            const areaD = pathD + ` L${xS(pts[pts.length - 1][0]).toFixed(1)},${h} L${xS(pts[0][0]).toFixed(1)},${h} Z`;
            return (
              <g key={si}>
                <path d={areaD} fill={s.fill || s.color} opacity={s.fill ? 1 : 0.06} />
                <path d={pathD} fill="none" stroke={s.color} strokeWidth={s.bold ? 2.5 : 1.8} opacity={s.dashed ? 0.6 : 0.85}
                  strokeDasharray={s.dashed ? "6,3" : "none"} />
                {pts.length <= 25 && pts.map(([x, y], pi) => (
                  <circle key={pi} cx={xS(x)} cy={yS(y)} r={s.bold ? 3 : 2.2} fill={s.color} opacity={0.7} />
                ))}
              </g>
            );
          })}

          {/* Axis labels */}
          <text x={w / 2} y={h + 38} textAnchor="middle" fill="#475569" fontSize={11} fontFamily="var(--f)">Year</text>
          {yLabel && <text x={-h / 2} y={-65} textAnchor="middle" fill="#475569" fontSize={11} fontFamily="var(--f)" transform="rotate(-90)">{yLabel}</text>}
        </g>
      </svg>

      {/* Legend below the chart — replaces the small inline end-of-line tags */}
      {series.filter(s => s.label).length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "10px 18px",
          padding: "6px 12px 0", marginLeft: mg.left, marginRight: mg.right,
          fontSize: 11, fontFamily: "var(--f)", color: "#cbd5e1",
        }}>
          {series.filter(s => s.label).map((s, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width={22} height={10} style={{ flexShrink: 0 }}>
                <line
                  x1={1} y1={5} x2={21} y2={5}
                  stroke={s.color}
                  strokeWidth={s.bold ? 2.5 : 1.8}
                  strokeDasharray={s.dashed ? "5,2" : "none"}
                  opacity={s.dashed ? 0.7 : 0.95}
                />
              </svg>
              <span style={{ color: s.color, fontWeight: s.bold ? 600 : 500 }}>{s.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AllocationPie({ alloc, wartime, setWartime, accentColor, title, stats, width, height }) {
  const W = width || 240, H = height || 300;
  const r = W * 0.29, cx = W / 2, cy = H * 0.46;
  const slices = [
    { key: "experimental", label: "Experimental", color: "#6366f1", frac: alloc.experimental },
    { key: "training", label: "Training runs", color: accentColor, frac: alloc.training },
    { key: "internal", label: "Internal inference", color: "#14b8a6", frac: alloc.internal },
    { key: "customer", label: "Customer inference", color: "#334155", frac: alloc.customer },
  ];
  let angle = -Math.PI / 2;
  const arcs = slices.map(s => {
    const start = angle;
    const sweep = s.frac * 2 * Math.PI;
    angle += sweep;
    const end = angle;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    const mid = start + sweep / 2;
    const innerR = r * 0.62, outerR = r * 1.22;
    const lx = cx + innerR * Math.cos(mid), ly = cy + innerR * Math.sin(mid);
    const ox = cx + outerR * Math.cos(mid), oy = cy + outerR * Math.sin(mid);
    const anchor = Math.cos(mid) < -0.1 ? "end" : Math.cos(mid) > 0.1 ? "start" : "middle";
    return { ...s, d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`, lx, ly, ox, oy, anchor, pct: (s.frac * 100).toFixed(0) };
  });
  return (
    <div>
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
        <text x={W/2} y={16} textAnchor="middle" fill="#94a3b8" fontSize={13} fontFamily="var(--f)" fontWeight={600}>{title}</text>
        <text x={W/2} y={30} textAnchor="middle" fill="#475569" fontSize={10} fontFamily="var(--f)">Leading company compute allocation</text>

        {arcs.map(a => (
          <g key={a.key}>
            <path d={a.d} fill={a.color} opacity={a.key === "customer" ? 0.5 : 0.8} stroke="#0f172a" strokeWidth={2} />
            {/* Inner percentage */}
            {a.frac > 0.05 && <text x={a.lx} y={a.ly + 4} textAnchor="middle" fill="#e2e8f0" fontSize={11} fontFamily="var(--f)" fontWeight={700}>{a.pct}%</text>}
            {/* Outer label with line */}
            <line x1={cx + r * 0.92 * Math.cos(Math.atan2(a.ly - cy, a.lx - cx))} y1={cy + r * 0.92 * Math.sin(Math.atan2(a.ly - cy, a.lx - cx))} x2={a.ox} y2={a.oy} stroke="#475569" strokeWidth={0.5} opacity={0.5} />
            <text x={a.ox + (a.anchor === "start" ? 4 : a.anchor === "end" ? -4 : 0)} y={a.oy + 3} textAnchor={a.anchor} fill="#94a3b8" fontSize={9} fontFamily="var(--f)">{a.label}</text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r={r * 0.3} fill="#0f172a" stroke="#1e293b" strokeWidth={1} />
        <text x={cx} y={cy + 3} textAnchor="middle" fill="#64748b" fontSize={8} fontFamily="var(--f)">TOTAL</text>

        {/* Legend row at bottom */}
        {stats && stats.map((s, i) => (
          <g key={i} transform={`translate(${20 + i * 160}, ${H - 55})`}>
            <text x={0} y={0} fill="#64748b" fontSize={8} fontFamily="var(--f)" textTransform="uppercase" letterSpacing="0.5">{s.label}</text>
            <text x={0} y={14} fill={s.color} fontSize={14} fontFamily="var(--f)" fontWeight={700}>{s.value}</text>
            {s.sub && <text x={0} y={25} fill="#475569" fontSize={8} fontFamily="var(--f)">{s.sub}</text>}
          </g>
        ))}
      </svg>
      {setWartime && (
        <div style={{ textAlign: "center", marginTop: -4 }}>
          <label style={{ fontSize: 10, color: wartime ? "#ef4444" : "#64748b", fontFamily: "var(--f)", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
            <input type="checkbox" checked={wartime} onChange={e => setWartime(e.target.checked)} style={{ accentColor: "#ef4444", width: 12, height: 12 }} />
            Wartime reallocation
          </label>
        </div>
      )}
    </div>
  );
}

function TrainingTimeline({ usS, cnS, alpha, usStrikeDate, cnStrikeDate, usStrikeEnabled, cnStrikeEnabled, fmtDate, fmtDur, milestoneLabel }) {
  const hasUS = usS && usS.baselineStart && usS.baselineDone < Infinity;
  const hasCN = cnS && cnS.baselineStart && cnS.baselineDone < Infinity;
  if (!hasUS && !hasCN) return null;

  const sw = 1/12;
  const barH = 22, gap = 4, groupGap = 14, labelW = 120;
  const mg = { top: 8, right: 20, bottom: 32, left: labelW + 8 };
  // W is computed below, once xMin/xMax are known, to keep ~120 px/year density.

  // Compute segments for a country: returns { base: [...], atk: [...] }
  // Each segment: { start, end, type: 'wait'|'pre'|'post'|'switch'|'idle' }
  function getSegments(s, sd) {
    if (!s || !s.baselineStart || s.baselineDone === Infinity) return null;
    const ref = (s.disabled + s.preempted > 0) ? sd : NOW;
    const base = [];
    if (s.baselineStart > NOW + 0.02) base.push({ start: NOW, end: s.baselineStart, type: "wait" });
    base.push({ start: s.baselineStart, end: s.baselinePreEnd, type: "pre" });
    base.push({ start: s.baselinePreEnd, end: s.baselineDone, type: "post" });

    let atk = null;
    if (s.scenario === "before" && s.attackStart && s.earliestDone < Infinity) {
      atk = [];
      if (s.attackStart > ref + 0.02) atk.push({ start: ref, end: Math.min(ref + sw, s.attackStart), type: "switch" });
      if (s.attackStart > ref + sw + 0.02) atk.push({ start: ref + sw, end: s.attackStart, type: "wait" });
      atk.push({ start: s.attackStart, end: s.attackPreEnd, type: "pre" });
      atk.push({ start: s.attackPreEnd, end: s.earliestDone, type: "post" });
    } else if (s.scenario === "mid-pre" && s.earliestDone < Infinity) {
      atk = [];
      atk.push({ start: s.baselineStart, end: sd, type: "pre" });
      atk.push({ start: sd, end: sd + sw, type: "switch" });
      if (s.attackStart > sd + sw + 0.02) atk.push({ start: sd + sw, end: s.attackStart, type: "wait" });
      atk.push({ start: s.attackStart, end: s.attackPreEnd, type: "pre" });
      atk.push({ start: s.attackPreEnd, end: s.earliestDone, type: "post" });
    } else if (s.scenario === "mid-post" && s.earliestDone < Infinity) {
      atk = [];
      atk.push({ start: s.baselineStart, end: s.baselinePreEnd, type: "pre" });
      atk.push({ start: s.baselinePreEnd, end: sd, type: "post" });
      atk.push({ start: sd, end: sd + sw, type: "switch" });
      if (s.attackStart > sd + sw + 0.02) atk.push({ start: sd + sw, end: s.attackStart, type: "wait" });
      atk.push({ start: s.attackStart, end: s.earliestDone, type: "post" });
    } else if (s.scenario === "degraded" && s.earliestDone < Infinity) {
      atk = [];
      atk.push({ start: s.baselineStart, end: s.baselinePreEnd, type: "pre" });
      atk.push({ start: s.baselinePreEnd, end: s.earliestDone, type: "post" });
    }
    return { base, atk };
  }

  const usSegs = hasUS ? getSegments(usS, usStrikeDate) : null;
  const cnSegs = hasCN ? getSegments(cnS, cnStrikeDate) : null;

  // Compute x range
  const allTimes = [NOW];
  const addTimes = (segs) => { if(segs) segs.forEach(s => { allTimes.push(s.start); allTimes.push(s.end); }); };
  if(usSegs) { addTimes(usSegs.base); addTimes(usSegs.atk); }
  if(cnSegs) { addTimes(cnSegs.base); addTimes(cnSegs.atk); }
  if(usStrikeEnabled) allTimes.push(usStrikeDate);
  if(cnStrikeEnabled) allTimes.push(cnStrikeDate);
  const xMin = Math.min(...allTimes) - 0.1;
  const xMax = Math.max(...allTimes) + 0.1;
  // Dynamic width: hold ~120 px/year density; minimum 1060 so short ranges stay compact.
  const PX_PER_YEAR = 120;
  const W = Math.max(1060, Math.round((xMax - xMin) * PX_PER_YEAR + mg.left + mg.right));

  // Count rows
  const rows = [];
  if (hasUS) {
    rows.push({ label: "US baseline", segs: usSegs.base, country: "US", isAtk: false });
    if (usSegs.atk && usS.scenario !== "none" && usS.scenario !== "after")
      rows.push({ label: "US post-attack", segs: usSegs.atk, country: "US", isAtk: true });
  }
  if (hasCN) {
    rows.push({ label: "CN baseline", segs: cnSegs.base, country: "CN", isAtk: false });
    if (cnSegs.atk && cnS.scenario !== "none" && cnS.scenario !== "after")
      rows.push({ label: "CN post-attack", segs: cnSegs.atk, country: "CN", isAtk: true });
  }

  const totalH = rows.length * (barH + gap) + (hasUS && hasCN ? groupGap : 0) + mg.top + mg.bottom;
  const w = W - mg.left - mg.right;

  const xS = v => ((v - xMin) / (xMax - xMin)) * w;

  const yearMin = Math.ceil(xMin), yearMax = Math.floor(xMax);
  const xTicks = [];
  for (let y = yearMin; y <= yearMax; y++) xTicks.push(y);

  const colors = {
    US: { wait: "#1e3a5f", pre: "#3b82f6", post: "#60a5fa", text: "#93c5fd" },
    CN: { wait: "#78350f", pre: "#d97706", post: "#fbbf24", text: "#fde68a" },
    switch: "#ef4444",
  };

  let yPos = mg.top;
  const rowPositions = [];
  let prevCountry = null;
  for (const row of rows) {
    if (prevCountry && prevCountry !== row.country) yPos += groupGap;
    rowPositions.push(yPos);
    yPos += barH + gap;
    prevCountry = row.country;
  }
  const chartH = yPos + mg.bottom - gap;

  return (
    <div style={{ width: "100%" }}>
      {/* viewBox + width:100% scales the SVG to fit the container, so the
          full timeline is always visible regardless of how long the run
          window is. We keep W >= 1060 in the viewBox so short runs stay
          readable, but the SVG itself stretches to whatever space is
          available (text shrinks proportionally on narrower screens). */}
      <svg viewBox={`0 0 ${W} ${chartH}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        <defs>
          <pattern id="stripes" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="2" opacity="0.6"/>
          </pattern>
        </defs>

        {/* Time axis grid */}
        {xTicks.map(t => (
          <g key={t}>
            <line x1={mg.left + xS(t)} y1={mg.top - 4} x2={mg.left + xS(t)} y2={chartH - mg.bottom + 4} stroke="#1e293b" strokeWidth={0.5} strokeDasharray="3,4" opacity={0.4} />
            <text x={mg.left + xS(t)} y={chartH - mg.bottom + 18} textAnchor="middle" fill="#64748b" fontSize={10} fontFamily="var(--f)">{t}</text>
          </g>
        ))}

        {/* Now line */}
        <line x1={mg.left + xS(NOW)} y1={mg.top - 4} x2={mg.left + xS(NOW)} y2={chartH - mg.bottom + 4} stroke="#64748b" strokeWidth={1} strokeDasharray="3,3" opacity={0.3} />

        {/* Strike lines */}
        {usStrikeEnabled && (
          <>
            <rect x={mg.left + xS(usStrikeDate) - 1} y={mg.top - 4} width={2} height={chartH - mg.top - mg.bottom + 8} fill="#d97706" opacity={0.08} rx={1} />
            <line x1={mg.left + xS(usStrikeDate)} y1={mg.top - 4} x2={mg.left + xS(usStrikeDate)} y2={chartH - mg.bottom + 4} stroke="#d97706" strokeWidth={1.5} opacity={0.4} />
            <text x={mg.left + xS(usStrikeDate)} y={mg.top - 7} textAnchor="middle" fill="#d97706" fontSize={7} fontFamily="var(--f)" fontWeight={600} opacity={0.7}>CN{"\u2192"}US</text>
          </>
        )}
        {cnStrikeEnabled && (
          <>
            <rect x={mg.left + xS(cnStrikeDate) - 1} y={mg.top - 4} width={2} height={chartH - mg.top - mg.bottom + 8} fill="#3b82f6" opacity={0.08} rx={1} />
            <line x1={mg.left + xS(cnStrikeDate)} y1={mg.top - 4} x2={mg.left + xS(cnStrikeDate)} y2={chartH - mg.bottom + 4} stroke="#3b82f6" strokeWidth={1.5} opacity={0.4} />
            <text x={mg.left + xS(cnStrikeDate) + 2} y={mg.top - 1} textAnchor="start" fill="#3b82f6" fontSize={7} fontFamily="var(--f)" fontWeight={600} opacity={0.7}>US{"\u2192"}CN</text>
          </>
        )}

        {/* Bars */}
        {rows.map((row, ri) => {
          const y = rowPositions[ri];
          const c = colors[row.country];
          return (
            <g key={ri}>
              {/* Row label */}
              <text x={mg.left - 10} y={y + barH / 2 + 4} textAnchor="end" fill={row.isAtk ? "#94a3b8" : c.text} fontSize={10} fontFamily="var(--f)" fontWeight={row.isAtk ? 400 : 600} opacity={row.isAtk ? 0.7 : 0.9}>
                {row.label}
              </text>

              {/* Segments */}
              {row.segs.map((seg, si) => {
                const sx = mg.left + xS(seg.start);
                const ex = mg.left + xS(seg.end);
                const sw2 = Math.max(ex - sx, 1);
                const fill = seg.type === "switch" ? "url(#stripes)"
                  : seg.type === "wait" ? c.wait
                  : seg.type === "pre" ? c.pre
                  : c.post;
                const opacity = row.isAtk ? (seg.type === "switch" ? 0.8 : 0.55) : (seg.type === "wait" ? 0.5 : 0.85);
                const isFirst = si === 0;
                const isLast = si === row.segs.length - 1;
                return (
                  <g key={si}>
                    <rect x={sx} y={y} width={sw2} height={barH} fill={fill} opacity={opacity}
                      rx={isFirst ? 3 : 0} ry={isFirst ? 3 : 0} />
                    {isLast && <rect x={ex - 3} y={y} width={3} height={barH} fill={fill} opacity={opacity} rx={3} />}
                    {seg.type === "switch" && <rect x={sx} y={y} width={sw2} height={barH} fill="#1a0000" opacity={0.4} />}
                    {/* Segment label if wide enough */}
                    {sw2 > 36 && seg.type !== "switch" && (
                      <text x={sx + sw2/2} y={y + barH/2 + 3.5} textAnchor="middle" fill={seg.type === "wait" ? "#94a3b8" : "#0f172a"} fontSize={8} fontFamily="var(--f)" fontWeight={600} opacity={seg.type === "wait" ? 0.6 : 0.7}>
                        {seg.type === "wait" ? "wait" : seg.type === "pre" ? "pre-train" : "post-train"}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Completion date label */}
              {row.segs.length > 0 && (() => {
                const lastSeg = row.segs[row.segs.length - 1];
                const ex = mg.left + xS(lastSeg.end);
                const s = row.isAtk ? (row.country === "US" ? usS : cnS) : (row.country === "US" ? usS : cnS);
                const doneDate = row.isAtk ? s.earliestDone : s.baselineDone;
                return <text x={ex + 5} y={y + barH/2 + 3.5} fill={row.isAtk ? "#ef4444" : c.text} fontSize={9} fontFamily="var(--f)" fontWeight={600} opacity={0.75}>{fmtDate(doneDate)}</text>;
              })()}
            </g>
          );
        })}

        {/* Delay brackets */}
        {hasUS && usSegs.atk && usS.attackDelay > 0.02 && usS.attackDelay < 100 && (() => {
          const baseX = mg.left + xS(usS.baselineDone);
          const atkX = mg.left + xS(usS.earliestDone);
          if (Math.abs(atkX - baseX) < 6) return null;
          const usAtkRow = rowPositions[1];
          const bracketY = usAtkRow + barH + 2;
          const baseDelayStr = usS.attackDelay < 1/12 ? `${(usS.attackDelay*365).toFixed(0)}d delay` : usS.attackDelay < 1 ? `${(usS.attackDelay*12).toFixed(1)}mo delay` : `${usS.attackDelay.toFixed(1)}yr delay`;
          const delayStr = milestoneLabel ? `${baseDelayStr} (${milestoneLabel})` : baseDelayStr;
          return <text x={(baseX+atkX)/2} y={bracketY + 10} textAnchor="middle" fill="#f87171" fontSize={8} fontFamily="var(--f)" fontWeight={600} opacity={0.6}>{delayStr}</text>;
        })()}
      </svg>

      {/* Legend */}
      <div style={{ display:"flex", gap:16, justifyContent:"center", flexWrap:"wrap", marginTop:4, fontSize:10, fontFamily:"var(--f)", color:"#64748b" }}>
        <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:2,background:"#3b82f6",opacity:0.85}}/>Pre-training</span>
        <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:2,background:"#60a5fa",opacity:0.85}}/>Post-training</span>
        <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:2,background:"#1e3a5f",opacity:0.5}}/>Wait (algo improvement)</span>
        <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:2,background:"#ef4444",opacity:0.5}}/>Switchover</span>
      </div>
    </div>
  );
}

export default function App() {
  // === Default scenario: China first-strikes to prevent US TED-AI ===
  // US retaliatory strike, 1 month after CN
  const [usAtkThreshold, setUsAtkThreshold] = useState(500000);
  const [usAtkStrikeDate, setUsAtkStrikeDate] = useState(2031.0);
  const [usAtkEnabled, setUsAtkEnabled] = useState(true);
  const [usAtkPreempt, setUsAtkPreempt] = useState(false);
  // Alternative selector for US attack: pick by % of CN compute destroyed instead
  // of by cluster-size threshold. When usAtkPctMode is true, effUsAtkThreshold is
  // derived from usAtkPctDestroyed via thresholdForPctDestroyed.
  const [usAtkPctMode, setUsAtkPctMode] = useState(true);
  const [usAtkPctDestroyed, setUsAtkPctDestroyed] = useState(75);
  // Duration (years) over which continuous denial actively prevents new
  // above-threshold builds. After this window passes the strike date, normal
  // building resumes. Decouples denial impact from the milestone horizon so
  // strike effects are comparable across AC/SAR/...ASI.
  const [usAtkDenialYears, setUsAtkDenialYears] = useState(1);
  // China first strike
  const [cnAtkThreshold, setCnAtkThreshold] = useState(500000);
  const [cnAtkStrikeDate, setCnAtkStrikeDate] = useState(2031.0);
  const [cnAtkEnabled, setCnAtkEnabled] = useState(true);
  const [cnAtkPreempt, setCnAtkPreempt] = useState(false);
  const [cnAtkPctMode, setCnAtkPctMode] = useState(true);
  const [cnAtkPctDestroyed, setCnAtkPctDestroyed] = useState(75);
  const [cnAtkDenialYears, setCnAtkDenialYears] = useState(1);

  // Supply chain: China destroys TSMC in opening salvo, US retaliates with strikes on Chinese fabs
  const [tsmcDestroyed, setTsmcDestroyed] = useState(true);
  const [usStrikeCnFabs, setUsStrikeCnFabs] = useState(true);

  // SAR target in Feb-2025 eFLOP (1e33), shifted to March-2026 internal reference
  const [flopExp, setFlopExp] = useState(Math.log10(8e37) - FLOP_EPOCH_SHIFT);  // ASI default
  const [eta, setEta] = useState(0.43);
  const [u, setU] = useState(0.90);
  const [alpha, setAlpha] = useState(0.5);
  const [halvingMonths, setHalvingMonths] = useState(7.5);
  const [showAdv, setShowAdv] = useState(false);
  const [showSim, setShowSim] = useState(true);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [hiddenTipHover, setHiddenTipHover] = useState(false);
  const [usNatEnabled, setUsNatEnabled] = useState(false); // US nationalization OFF by default
  const [usNatDate, setUsNatDate] = useState(2031.0);
  const [cnNatEnabled, setCnNatEnabled] = useState(false);
  const [cnNatDate, setCnNatDate] = useState(2031.0);
  const [wartime, setWartime] = useState(false); // US wartime allocation OFF by default
  const [cnWartime, setCnWartime] = useState(false); // CN wartime allocation
  const [diffusion, setDiffusion] = useState(0); // off by default — opt-in to algorithmic diffusion
  const [dynamicThresholdDenial, setDynamicThresholdDenial] = useState(false); // prototype: recompute denial threshold each month to maintain pct destroyed

  // Local fallback only: legacy MAIM saturating-speedup. Used when Python
  // backend is off/offline. When backend is on, remoteAlgoFns override this.
  const algoBuilder = buildAlgoMultiplier;
  const algoYearly = algoYearlyMultAt;

  // === AIFP Python backend wiring ===
  const [useAifpBackend, setUseAifpBackend] = useState(true);
  const [aifpPreset, setAifpPreset] = useState("default");
  // Exposed user-overridable AIFP parameters. Empty string = use preset/default.
  const [ovPresentDoublingTime, setOvPresentDoublingTime] = useState("");
  const [ovDoublingDifficulty, setOvDoublingDifficulty] = useState("");
  const [ovSwProgressRate, setOvSwProgressRate] = useState("");
  const [ovTasteSlope, setOvTasteSlope] = useState("");
  const [ovAcHorizon, setOvAcHorizon] = useState("");
  const [showAifpOverrides, setShowAifpOverrides] = useState(false);
  const aifpOverrides = useMemo(() => {
    const out = {};
    if (ovPresentDoublingTime !== "") out.present_doubling_time = parseFloat(ovPresentDoublingTime);
    if (ovDoublingDifficulty !== "") out.doubling_difficulty_growth_factor = parseFloat(ovDoublingDifficulty);
    if (ovSwProgressRate !== "") out.software_progress_rate_at_reference_year = parseFloat(ovSwProgressRate);
    if (ovTasteSlope !== "") out.ai_research_taste_slope = parseFloat(ovTasteSlope);
    if (ovAcHorizon !== "") out.ac_time_horizon_minutes = parseFloat(ovAcHorizon);
    return out;
  }, [ovPresentDoublingTime, ovDoublingDifficulty, ovSwProgressRate, ovTasteSlope, ovAcHorizon]);
  const [remoteAlgoFns, setRemoteAlgoFns] = useState({}); // scenario_id -> (t) => algo_multiplier
  const [remoteRateFns, setRemoteRateFns] = useState({}); // scenario_id -> (t) => sw_rate OOM/yr
  const [remoteMilestones, setRemoteMilestones] = useState({});
  const [backendStatus, setBackendStatus] = useState("idle"); // idle|loading|connected|error
  const [backendError, setBackendError] = useState("");
  const lastFetchKeyRef = useRef("");
  // Manual-run trigger for AIFP backend. Bumping this counter fires a fetch.
  // Initial value 1 -> auto-runs once on mount; subsequent runs require a click.
  const [runVersion, setRunVersion] = useState(1);
  const [lastFetchedKey, setLastFetchedKey] = useState("");

  const [customFlop, setCustomFlop] = useState(false);

  // Debug: expose state setters on window for programmatic UI control during audits.
  useEffect(() => {
    window.__setUI = {
      // Strike toggles + params
      setCnAtkEnabled, setCnAtkStrikeDate, setCnAtkPctDestroyed, setCnAtkPctMode, setCnAtkPreempt, setCnAtkThreshold, setCnAtkDenialYears,
      setUsAtkEnabled, setUsAtkStrikeDate, setUsAtkPctDestroyed, setUsAtkPctMode, setUsAtkPreempt, setUsAtkThreshold, setUsAtkDenialYears,
      setTsmcDestroyed, setUsStrikeCnFabs,
      // Nationalization
      setCnNatEnabled, setCnNatDate, setUsNatEnabled, setUsNatDate,
      // Diffusion + milestone
      setDiffusion, setFlopExp, setCustomFlop,
      // Continuous-denial mode toggle (prototype)
      setDynamicThresholdDenial,
      // Trigger Run Model
      run: () => setRunVersion(v => v + 1),
    };
  }, []);

  // Sync dynamic-threshold-denial state to global flag the analytical code reads.
  useEffect(() => {
    window.__dynamicThresholdDenial = dynamicThresholdDenial;
  }, [dynamicThresholdDenial]);

  // === Parameter sweep panel state ===
  const [sweepOpen, setSweepOpen] = useState(false);
  const [sweepConfigText, setSweepConfigText] = useState(`{
  "defenders": ["US"],
  "vary": {
    "cnAtkStrikeDate": "monthly(2026.5, 2031.5)",
    "cnAtkPctDestroyed": [50, 75, 90]
  },
  "hold": {
    "usAtkEnabled": false,
    "cnAtkPctMode": true,
    "cnAtkPreempt": false,
    "tsmcDestroyed": true,
    "cnAtkEnabled": true
  },
  "measure": ["SAR"],
  "include": ["target_count"],
  "plot": { "metric": "delay", "unit": "months" }
}`);
  const [sweepStatus, setSweepStatus] = useState("");
  const [sweepRunning, setSweepRunning] = useState(false);
  const sweepProgressRef = useRef(null);

  // Label for the currently-selected capability milestone (e.g. "SAR"), used
  // to annotate the attack-caused delay so the reader knows which milestone
  // it refers to. Null when the FLOP threshold is set to a custom value not
  // matching a preset.
  const activeMilestoneLabel = (() => {
    if (customFlop) return null;
    const m = MILESTONES.find(m => Math.abs(flopExp - feb2025ToInternalExp(m.feb2025Log10)) < 0.05);
    return m ? m.label : null;
  })();

    // Compute allocation fractions
  const ALLOC_PEACE = { experimental: 0.50, internal: 0.05, training: 0.08, customer: 0.37 };
  const allocWartime = useMemo(() => {
    const freed = ALLOC_PEACE.customer - 0.05; // keep 5% customer
    const nonCust = ALLOC_PEACE.experimental + ALLOC_PEACE.internal + ALLOC_PEACE.training;
    return {
      experimental: ALLOC_PEACE.experimental + freed * (ALLOC_PEACE.experimental / nonCust),
      internal: ALLOC_PEACE.internal + freed * (ALLOC_PEACE.internal / nonCust),
      training: ALLOC_PEACE.training + freed * (ALLOC_PEACE.training / nonCust),
      customer: 0.05,
    };
  }, []);
  const alloc = wartime ? allocWartime : ALLOC_PEACE;
  const cnAlloc = cnWartime ? allocWartime : ALLOC_PEACE;

  const fEff = Math.pow(10, flopExp);
  const p = P_BF16;
  const rate = halvingToRate(halvingMonths);

  // Per-attack effective values: US attacks CN, CN attacks US
  // Strike dates: if attack panel is off but SC blowback is active, use SC date (not NOW)
  const effCnAtkStrikeDate = cnAtkEnabled ? cnAtkStrikeDate : NOW;
  const effUsAtkStrikeDate = usAtkEnabled ? usAtkStrikeDate : NOW;

  // Supply chain: each toggle gated by its attack panel
  const T = (tsmcDestroyed && cnAtkEnabled) ? 1 : 0;
  const D = (usStrikeCnFabs && usAtkEnabled) ? 1 : 0;
  // Each strike reduces its target half by 95% (5% residual production from
  // partial-survivor effects: damaged-but-operating fabs, dispersed inventory,
  // small alternative producers). So:
  //   US scFactor = 5% (Samsung + Intel survive) + 95% × (1-T) (TSMC-dep half)
  //   CN scFactor = SMIC half × (1 - 0.95D) + TSMC-dep half × (1 - 0.95T)
  // Per Zakaria 2026: of China's 9.1% post-BIS share, 4.4 pp is domestic SMIC
  // production and 4.7 pp depends on TSMC (smuggling + remote access).
  const SC_RESIDUAL = 0.05;  // 5% surviving fraction within each struck component
  const usSCFactor = (1 - 0.95 * T);
  const cnSCFactor = 0.484 * (1 - 0.95 * D) + 0.516 * (1 - 0.95 * T);
  // SC active flags: match original structure (gated by attack enabled)
  const cnAtkSCActive = T === 1;           // TSMC hurts US supply
  const usAtkSCActive = cnSCFactor < 1.0;  // anything hurts China supply
  // SC dates: TSMC follows CN strike, SMIC follows US strike
  const cnSCStrikeDate = Math.min(T ? cnAtkStrikeDate : Infinity, D ? usAtkStrikeDate : Infinity);

  // Effective strike thresholds. When the user selects pct mode, the threshold
  // is derived by inverting analyticalStrikeOutcome — given a target % of
  // national compute destroyed at strike, find the cluster-size cutoff that
  // produces it. Otherwise the threshold slider's value is used directly.
  const effCnAtkThreshold = useMemo(() => {
    if (!cnAtkEnabled) return 1e11;
    if (!cnAtkPctMode) return cnAtkThreshold;
    const tsmcStrike = tsmcDestroyed && cnAtkEnabled;
    const csUs = cnAtkSCActive ? { strikeYear: cnAtkStrikeDate, scFactor: usSCFactor, tsmcStrike } : null;
    const dates = [];
    if (usAtkEnabled) dates.push(usAtkStrikeDate);
    if (cnAtkEnabled) dates.push(cnAtkStrikeDate);
    const txEnd = dates.length > 0 ? Math.min(...dates) : Infinity;
    return thresholdForPctDestroyed("US", cnAtkPctDestroyed, effCnAtkStrikeDate, cnAtkPreempt, csUs, txEnd, cnAtkDenialYears);
  }, [cnAtkEnabled, cnAtkPctMode, cnAtkPctDestroyed, cnAtkThreshold, cnAtkStrikeDate, effCnAtkStrikeDate, cnAtkPreempt, cnAtkDenialYears, cnAtkSCActive, usSCFactor, tsmcDestroyed, usAtkEnabled, usAtkStrikeDate]);

  const effUsAtkThreshold = useMemo(() => {
    if (!usAtkEnabled) return 1e11;
    if (!usAtkPctMode) return usAtkThreshold;
    const tsmcStrike = tsmcDestroyed && cnAtkEnabled;
    const smicStrike = usStrikeCnFabs && usAtkEnabled;
    const csCn = usAtkSCActive ? { strikeYear: cnSCStrikeDate, scFactor: cnSCFactor, tsmcStrike, smicStrike } : null;
    const dates = [];
    if (usAtkEnabled) dates.push(usAtkStrikeDate);
    if (cnAtkEnabled) dates.push(cnAtkStrikeDate);
    const txEnd = dates.length > 0 ? Math.min(...dates) : Infinity;
    return thresholdForPctDestroyed("China", usAtkPctDestroyed, effUsAtkStrikeDate, usAtkPreempt, csCn, txEnd, usAtkDenialYears);
  }, [usAtkEnabled, usAtkPctMode, usAtkPctDestroyed, usAtkThreshold, usAtkStrikeDate, effUsAtkStrikeDate, usAtkPreempt, usAtkDenialYears, usAtkSCActive, cnSCFactor, cnSCStrikeDate, tsmcDestroyed, usStrikeCnFabs, cnAtkEnabled, cnAtkStrikeDate]);
  // SC extra fab targets
  // US (TSMC) target count: 8 today (2026) — leading-edge Taiwan fabs + Arizona ramp.
  // +1 every 2 years (matches CN scaling rate) as Fab 21 Arizona / AP7 / Kumamoto / new packaging come online.
  const usSCTargets = T
    ? Math.round(8 + Math.max(0, cnAtkStrikeDate - 2026) / 2)
    : 0;
  // China target count: 4 today (2026), +1 every 2 years (matches US scaling rate).
  const cnSCTargets = D
    ? Math.round(4 + Math.max(0, usAtkStrikeDate - 2026) / 2)
    : 0;
  // Fix: if US attack is off but SC blowback hits China (via TSMC), use TSMC date for timing
  const effUsAtkStrikeDateSC = usAtkEnabled ? effUsAtkStrikeDate : (usAtkSCActive ? cnSCStrikeDate : NOW);
  const effCnAtkStrikeDateSC = effCnAtkStrikeDate; // CN SC always requires cnAtkEnabled, so no fixup needed

  const points = useMemo(() => {
    const src = showSim ? ALL_CLUSTERS : CLUSTERS;
    return src.filter(c => {
      if (c.gpus < 1000 || c.year < 2022 || c.year >= 2041) return false;
      if (!showAllGroups && (c.country === "Ally" || c.country === "Other")) return false;
      return true;
    });
  }, [showSim, showAllGroups]);

  // SC-adjusted points: per-country attack parameters
  // US clusters attacked by CN (cnAtk*), CN clusters attacked by US (usAtk*)
  const scPoints = useMemo(() => {
    const anySCActive = usAtkSCActive || cnAtkSCActive;
    if (!anySCActive) return points;

    // Build per-country strike config for sim re-generation.
    // tsmcStrike flag activates the permanent post-strike SC reduction (US stays
    // at 5% of counterfactual new-build rate; China at 0.484*(1-smicStrike) +
    // 0.516*0.05 if TSMC-dependent flow is also cut).
    const countryStrikes = {};
    const tsmcStrike = (tsmcDestroyed && cnAtkEnabled);
    const smicStrike = (usStrikeCnFabs && usAtkEnabled);
    if (cnAtkSCActive) countryStrikes.US = { strikeYear: cnAtkStrikeDate, scFactor: usSCFactor, tsmcStrike };
    if (usAtkSCActive) countryStrikes.China = { strikeYear: cnSCStrikeDate, scFactor: cnSCFactor, tsmcStrike, smicStrike };
    // Allies follow US SC params
    if (cnAtkSCActive) countryStrikes.Ally = { strikeYear: cnAtkStrikeDate, scFactor: usSCFactor, tsmcStrike };

    // Re-generate sim clusters with per-country SC.
    // transitionEndYear = earliest enabled strike date (drives BIS-tightening
    // share interpolation from SHARES_NOW to SHARES_AT_STRIKE).
    const txEnd = (() => {
      const dates = [];
      if (usAtkEnabled && isFinite(effUsAtkStrikeDate)) dates.push(effUsAtkStrikeDate);
      if (cnAtkEnabled && isFinite(effCnAtkStrikeDate)) dates.push(effCnAtkStrikeDate);
      return dates.length > 0 ? Math.min(...dates) : Infinity;
    })();
    const scSimsPostStrike = showSim ? (() => {
      const scSims = generateSimulatedClusters(countryStrikes, txEnd);
      const scSimsFiltered = scSims.filter(c => {
        if (c.gpus < 1000 || c.year < 2022 || c.year >= 2041) return false;
        if (!showAllGroups && (c.country === "Ally" || c.country === "Other")) return false;
        return true;
      });
      // Only keep sims for the effective strike year and later (these have pro-rated SC applied)
      return scSimsFiltered.filter(pt => {
        const cs = countryStrikes[pt.country];
        return cs ? Math.floor(pt.year) >= Math.floor(cs.strikeYear + SC_PIPELINE_DELAY) : false;
      });
    })() : [];

    // For pre-strike sims, keep originals
    const origSimPreStrike = points.filter(pt => {
      if (!pt.sim) return false;
      const cs = countryStrikes[pt.country];
      return cs ? Math.floor(pt.year) < Math.floor(cs.strikeYear + SC_PIPELINE_DELAY) : true;
    });

    // Delta-shrink real planned DCs per-country
    const realPoints = points.filter(pt => !pt.sim);
    const chainBaselines = {};
    realPoints.forEach(pt => {
      if (pt.chain < 0) return;
      const cs = countryStrikes[pt.country];
      const sd = cs ? cs.strikeYear : Infinity;
      if (pt.year <= sd) {
        if (!chainBaselines[pt.chain] || pt.gpus > chainBaselines[pt.chain]) {
          chainBaselines[pt.chain] = pt.gpus;
        }
      }
    });
    const adjustedReal = realPoints.map(pt => {
      const cs = countryStrikes[pt.country];
      if (!cs) return pt; // no SC for this country
      if (pt.year <= cs.strikeYear || pt.year <= NOW) return pt;
      const baseline = (pt.chain >= 0 && chainBaselines[pt.chain]) ? chainBaselines[pt.chain] : 0;
      const growth = Math.max(0, pt.gpus - baseline);
      const factor = getRecoveredSCFactor(pt.country, pt.year, cs);
      const newGpus = Math.round(baseline + growth * factor);
      if (newGpus < 1000) return null;
      return { ...pt, gpus: newGpus, supplyChainReduced: true };
    }).filter(Boolean);

    return [...adjustedReal, ...origSimPreStrike, ...scSimsPostStrike];
  }, [points, usAtkSCActive, cnAtkSCActive, cnAtkStrikeDate, cnSCStrikeDate, usSCFactor, cnSCFactor, showSim, showAllGroups]);

  const chainLinks = useMemo(() => {
    const byChain = {};
    scPoints.forEach((pt,i) => {
      if(pt.chain >= 0) {
        if(!byChain[pt.chain]) byChain[pt.chain] = [];
        byChain[pt.chain].push({...pt, idx:i});
      }
    });
    const links = [];
    Object.values(byChain).forEach(group => {
      if(group.length < 2) return;
      group.sort((a,b) => a.gpus - b.gpus);
      for(let i = 0; i < group.length - 1; i++) {
        links.push({ from: group[i], to: group[i+1] });
      }
    });
    return links;
  }, [scPoints]);

  const chainMembers = useMemo(() => {
    const m = {};
    scPoints.forEach((pt,i) => {
      if(pt.chain >= 0) {
        if(!m[pt.chain]) m[pt.chain] = [];
        m[pt.chain].push(i);
      }
    });
    return m;
  }, [scPoints]);

  const { usS, cnS, allyS, otherS } = useMemo(() => {
    const preFLOPs = alpha * fEff;
    const postFLOPs = (1 - alpha) * fEff;
    const pEtaU = p * eta * u * H_SEC;
    const SWITCH_DELAY = 1/12; // 1 month

    // === US BASELINE reference compute (no nat, no attack) ===
    // This is the single anchor for algo rates across ALL countries.
    // The slider's baseRate represents the US leading company's rate at NOW.
    const usBaselineAll = points.filter(pt => pt.country === "US");
    const usBaselineSiteMap = {};
    usBaselineAll.forEach((pt, idx) => {
      const key = pt.chain >= 0 ? "c" + pt.chain : "s" + idx;
      if (!usBaselineSiteMap[key]) usBaselineSiteMap[key] = { phases: [] };
      usBaselineSiteMap[key].phases.push(pt);
    });
    const usBaselineSites = Object.values(usBaselineSiteMap);
    const usBaselineTimeline = buildComputeTimeline(usBaselineSites, NOW, 2041, 0.05);
    const usBaselineRefCompute = usBaselineTimeline(NOW) * getCompanyShareOfNational(NOW);
    // US baseline company compute function (no nat, no attack) - used as diffusion reference
    const usBaselineCompanyFn = (t) => usBaselineTimeline(t) * getCompanyShareOfNational(t);

    // Shares-transition end year for analytical bucket calc (matches scPoints memo).
    const _analyticTxEnd = (() => {
      const dates = [];
      if (usAtkEnabled && isFinite(effUsAtkStrikeDate)) dates.push(effUsAtkStrikeDate);
      if (cnAtkEnabled && isFinite(effCnAtkStrikeDate)) dates.push(effCnAtkStrikeDate);
      return dates.length > 0 ? Math.min(...dates) : Infinity;
    })();
    const _analyticTsmcStrike = (tsmcDestroyed && cnAtkEnabled);
    const _analyticSmicStrike = (usStrikeCnFabs && usAtkEnabled);
    // Per-country supply-chain config for analytical strike outcome.
    const _analyticCsFor = (country) => {
      if (country === "US" && cnAtkSCActive) {
        return { strikeYear: cnAtkStrikeDate, scFactor: usSCFactor, tsmcStrike: _analyticTsmcStrike };
      }
      if (country === "China" && usAtkSCActive) {
        return { strikeYear: cnSCStrikeDate, scFactor: cnSCFactor, tsmcStrike: _analyticTsmcStrike, smicStrike: _analyticSmicStrike };
      }
      if (country === "Ally" && cnAtkSCActive) {
        return { strikeYear: cnAtkStrikeDate, scFactor: usSCFactor, tsmcStrike: _analyticTsmcStrike };
      }
      return null;
    };

    const computeStats = (country, natEnabled, natDate, effThreshold, effStrikeDate, scActive, countryDiffusion, diffusionRefFn, preempt, denialYears) => {
      const denialEnd = preempt && denialYears != null ? effStrikeDate + denialYears : effStrikeDate;
      const denialEndPad = denialEnd + 0.05;
      // === BASELINE: uses original (unreduced) data ===
      const all = points.filter(pt=>pt.country===country);

      const siteMap = {};
      all.forEach((pt,idx) => {
        const key = pt.chain >= 0 ? "c"+pt.chain : "s"+idx;
        if(!siteMap[key]) siteMap[key] = { phases:[], maxGpus:0, maxExistingGpus:0, hasExisting:false, hasPlanned:false };
        siteMap[key].phases.push(pt);
        if(pt.gpus > siteMap[key].maxGpus) siteMap[key].maxGpus = pt.gpus;
        if(pt.year <= effStrikeDate+0.05) {
          siteMap[key].hasExisting = true;
          if(pt.gpus > siteMap[key].maxExistingGpus) siteMap[key].maxExistingGpus = pt.gpus;
        } else {
          siteMap[key].hasPlanned = true;
        }
      });
      const sites = Object.values(siteMap);
      const allTimeline = buildComputeTimeline(sites, NOW, 2041, 0.05);

      // === SC-ADJUSTED: uses scPoints for hit detection + attack timelines ===
      const allSC = scPoints.filter(pt=>pt.country===country);

      const scSiteMap = {};
      allSC.forEach((pt,idx) => {
        const key = pt.chain >= 0 ? "c"+pt.chain : "s"+idx;
        if(!scSiteMap[key]) scSiteMap[key] = { phases:[], maxGpus:0, maxExistingGpus:0, maxInDenialWindow:0, hasExisting:false, hasPlanned:false };
        scSiteMap[key].phases.push(pt);
        if(pt.gpus > scSiteMap[key].maxGpus) scSiteMap[key].maxGpus = pt.gpus;
        if(pt.year <= effStrikeDate+0.05) {
          scSiteMap[key].hasExisting = true;
          if(pt.gpus > scSiteMap[key].maxExistingGpus) scSiteMap[key].maxExistingGpus = pt.gpus;
        } else {
          scSiteMap[key].hasPlanned = true;
        }
        if (pt.year <= denialEndPad && pt.gpus > scSiteMap[key].maxInDenialWindow) {
          scSiteMap[key].maxInDenialWindow = pt.gpus;
        }
      });
      const scSites = Object.values(scSiteMap);

      // Hit detection uses SC-adjusted sizes. Under preempt mode, "above threshold"
      // is judged inside the denial window only — post-window builds are not
      // suppressed and can drive the surviving training run.
      const disabledSites = scSites.filter(s => s.maxExistingGpus >= effThreshold);
      const preemptedSites = preempt ? scSites.filter(s => s.maxInDenialWindow >= effThreshold && s.maxExistingGpus < effThreshold) : [];
      const survivingSites = preempt
        ? scSites.filter(s => s.maxInDenialWindow < effThreshold)
        : scSites.filter(s => s.maxExistingGpus < effThreshold);
      const hasHits = disabledSites.length > 0 || preemptedSites.length > 0 || scActive;

      const disabledGPUs = disabledSites.reduce((s,site) => s + site.maxExistingGpus, 0);
      const preemptedGPUs = preemptedSites.reduce((s,site) => s + site.maxGpus, 0);
      const totalSites = scSites.filter(s => s.hasExisting).length;
      const totalGPUs = scSites.filter(s => s.hasExisting).reduce((s,site) => s + site.maxExistingGpus, 0);

      let largest = null;
      survivingSites.forEach(site => {
        site.phases.forEach(pt => {
          if(!largest || pt.gpus > largest.gpus) largest = pt;
        });
      });

      const postScale = (totalGpusVal, time) => {
        // Under nationalization, the company gets 0.9 of national compute. The
        // customer-inference workload is preserved at its counterfactual
        // (no-nat) absolute amount — the nation doesn't ask the leading lab
        // to scale customer service up by 4.5x. The remaining nationalized
        // pool is split across training/experimental/internal proportionally
        // to their alloc fractions.
        if (natEnabled && time >= natDate) {
          const customerKept = totalGpusVal * getCompanyShareOfNational(time) * alloc.customer;
          const companyTotal = totalGpusVal * 0.9;
          const internalPool = Math.max(0, companyTotal - customerKept);
          const denom = alloc.training + alloc.experimental + alloc.internal;
          return internalPool * (alloc.training / denom);
        }
        return totalGpusVal * getCompanyShareOfNational(time) * alloc.training;
      };

      // Attack timelines: surviving compute uses the analytical bucket model
      // (Fix 3A) so the per-time-step surviving compute curve is smooth in
      // strikeDate. The sim-cluster realization that feeds disabledSites etc.
      // remains for display, but the training-completion compute trajectory
      // consumes the same bucket math that the scoreboard already uses.
      // Attacker's pct target (used by dynamic-threshold denial when enabled).
      const _attackerPctMode = country === "US" ? cnAtkPctMode : (country === "China" ? usAtkPctMode : false);
      const _attackerPct = country === "US" ? cnAtkPctDestroyed : (country === "China" ? usAtkPctDestroyed : null);
      const _pctTarget = _attackerPctMode ? _attackerPct : null;
      const survTimeline = analyticalSurvivingTimeline(
        country, effThreshold, effStrikeDate, preempt,
        _analyticCsFor(country), _analyticTxEnd, NOW, 2041, 0.05, denialYears, _pctTarget);
      const allScTimeline = buildComputeTimeline(scSites, NOW, 2041, 0.05);

      // === Algo efficiency multipliers (saturating compute model) ===
      // rate(t) = baseRate * algoSpeedup(companyCompute(t) / refCompute)
      // Saturates toward 1000x asymptote (AIFP). 10x compute → 2.2x speedup.
      // The denominator is ALWAYS US baseline (no nat, no attack) at NOW.
      // This means CN starts with a lower rate proportional to its compute gap.
      // US nationalizing boosts US rate but does NOT drop CN rate.
      const actualShare = (t) => (natEnabled && t >= natDate) ? 0.9 : getCompanyShareOfNational(t);

      // Company compute functions for each scenario
      // Before the strike, country has full baseline compute. After, only surviving.
      const baselineCompanyFn = (t) => allTimeline(t) * actualShare(t);
      const attackCompanyFn = (t) => {
        if (t < effStrikeDate) return baselineCompanyFn(t);
        return survTimeline(t) * actualShare(t);
      };
      const scOnlyCompanyFn = (t) => {
        if (t < effStrikeDate) return baselineCompanyFn(t);
        return allScTimeline(t) * actualShare(t);
      };

      // All countries anchor to US baseline company compute at NOW
      const refCompute = usBaselineRefCompute;

      // Sample company compute timelines for the backend (monthly grid, 2024-2040).
      // For attack/scOnly timelines, inject refinement samples right at and just before
      // effStrikeDate so the post-strike discontinuity isn't smeared across a grid cell
      // when the backend np.interp's between samples.
      const _sampleTimeline = (fn, refineAt) => {
        const out = [];
        for (let y = 2024; y <= 2040.001; y += 1/12) out.push([y, Math.max(fn(y), 1)]);
        if (refineAt && refineAt > 2024 && refineAt < 2040) {
          const eps = 1e-3;
          out.push([refineAt - eps, Math.max(fn(refineAt - eps), 1)]);
          out.push([refineAt,       Math.max(fn(refineAt),       1)]);
        }
        out.sort((a, b) => a[0] - b[0]);
        return out;
      };
      const _baselineTL = _sampleTimeline(baselineCompanyFn, null);
      const _attackTL   = _sampleTimeline(attackCompanyFn,   effStrikeDate);
      const _scOnlyTL   = _sampleTimeline(scOnlyCompanyFn,   effStrikeDate);

      // Prefer AIFP backend-derived algo curve when available; fall back to local port.
      let _remoteBaseline = useAifpBackend ? remoteAlgoFns[`${country}-baseline`] : null;
      let _remoteAttack = useAifpBackend ? remoteAlgoFns[`${country}-attack`] : null;
      let _remoteScOnly = useAifpBackend ? remoteAlgoFns[`${country}-scOnly`] : null;

      // Apply κ-diffusion to China's remote algo curves: the Flask backend does
      // not apply κ (its multi-country bypass loop only re-integrates per-country
      // compute against the calibrated parameter vector). We mix endogenous CN
      // rate with US rate via the asymmetric formula and re-integrate to get a
      // diffused multiplier. Mirrors scripts/calibrate_kappa.py:integrate_cn_with_kappa.
      if (country === "China" && useAifpBackend && countryDiffusion > 0) {
        const buildDiffused = (cnRateId, usRateId) => {
          const cnFn = remoteRateFns[cnRateId];
          const usFn = remoteRateFns[usRateId];
          if (!cnFn || !usFn) return null;
          const tMin = 2024, tMax = 2042, step = 0.05;
          const n = Math.ceil((tMax - tMin) / step) + 1;
          const refYear = 2026.0;
          const refIdx = Math.max(0, Math.round((refYear - tMin) / step));
          const logA = new Float64Array(n);
          for (let i = 1; i < n; i++) {
            const t = tMin + i * step;
            const cnR = Math.max(0, cnFn(t) || 0);
            const usR = Math.max(0, usFn(t) || 0);
            const diffusedR = Math.max(cnR, (1 - countryDiffusion) * cnR + countryDiffusion * usR);
            logA[i] = logA[i - 1] + diffusedR * step;
          }
          const refLog = logA[refIdx];
          return function algoAt(t) {
            if (t <= refYear) return 1;
            if (t >= tMax) return Math.pow(10, logA[n - 1] - refLog);
            const idx = Math.min(Math.floor((t - tMin) / step), n - 1);
            return Math.pow(10, logA[Math.max(0, idx)] - refLog);
          };
        };
        const dB = buildDiffused("China-baseline", "US-baseline");
        const dA = buildDiffused("China-attack", "US-attack");
        const dS = buildDiffused("China-scOnly", "US-scOnly");
        if (dB) _remoteBaseline = dB;
        if (dA) _remoteAttack = dA;
        if (dS) _remoteScOnly = dS;
      }

      const baselineAlgo = _remoteBaseline || algoBuilder(baselineCompanyFn, refCompute, rate, countryDiffusion, diffusionRefFn);
      const attackAlgo = _remoteAttack || algoBuilder(attackCompanyFn, refCompute, rate, countryDiffusion, diffusionRefFn);
      const scOnlyAlgo = _remoteScOnly || algoBuilder(scOnlyCompanyFn, refCompute, rate, countryDiffusion, diffusionRefFn);

      // === BASELINE: best completion using ALL original sites, no attack ===
      const allPhases = paretoPhases(all);
      let baselineDone = Infinity, baselineCluster = null, baselineStrategy = "", baselineStart = null, baselinePreEnd = null;
      for(const pt of allPhases) {
        const avail = Math.max(pt.year, NOW);
        const res = bestCompletionV2(pt.gpus, avail, allTimeline, preFLOPs, postFLOPs, baselineAlgo, p, eta, u, NOW, postScale, postScale);
        if(res.done < baselineDone) {
          baselineDone = res.done; baselineStart = res.start; baselinePreEnd = res.preEnd;
          baselineCluster = pt; baselineStrategy = pt.year > NOW+0.05 ? "new build" : "existing";
        }
      }

      // === ATTACK SCENARIO: three branches based on strike timing ===
      let earliestDone = Infinity, bestCluster = null, bestStrategy = "", attackStart = null;
      let attackPreEnd = null, scenario = "none", fractionAtStrike = 0;

      if (!hasHits && !scActive) {
        // No hits, no SC: attack = baseline
        earliestDone = baselineDone; attackStart = baselineStart; attackPreEnd = baselinePreEnd;
        bestCluster = baselineCluster; bestStrategy = baselineStrategy; scenario = "none";

      } else if (!hasHits && scActive) {
        // No direct hits but SC reduces future compute growth
        // Compute using all SC-adjusted sites (none destroyed, but growth penalized)
        const scPhases = paretoPhases(allSC);
        for(const pt of scPhases) {
          const avail = Math.max(pt.year, NOW);
          const res = bestCompletionV2(pt.gpus, avail, allScTimeline, preFLOPs, postFLOPs, scOnlyAlgo, p, eta, u, NOW, postScale, postScale);
          if(res.done < earliestDone) { earliestDone = res.done; attackStart = res.start; attackPreEnd = res.preEnd; bestCluster = pt; bestStrategy = pt.year > NOW+0.05 ? "new build" : "existing"; }
        }
        scenario = "none";

      } else if (effStrikeDate >= baselineDone) {
        earliestDone = baselineDone; attackStart = baselineStart; attackPreEnd = baselinePreEnd;
        bestCluster = baselineCluster; bestStrategy = "completed before strike"; scenario = "after";

      } else if (effStrikeDate <= baselineStart) {
        const postSearchFrom = effStrikeDate + SWITCH_DELAY;
        const survPhases = paretoPhases(survivingSites.flatMap(s => s.phases));
        for(const pt of survPhases) {
          const avail = Math.max(pt.year, postSearchFrom);
          const res = bestCompletionV2(pt.gpus, avail, survTimeline, preFLOPs, postFLOPs, attackAlgo, p, eta, u, postSearchFrom, postScale, postScale);
          if(res.done < earliestDone) { earliestDone = res.done; attackStart = res.start; attackPreEnd = res.preEnd; bestCluster = pt; bestStrategy = pt.year > effStrikeDate+0.05 ? "new build" : "existing"; }
        }
        scenario = "before";

      } else {
        const baseClusterHit = baselineCluster && baselineCluster.gpus >= effThreshold;
        const postSearchFrom = effStrikeDate + SWITCH_DELAY;

        if (baseClusterHit && effStrikeDate < baselinePreEnd) {
          const preEff = baselineAlgo(baselineStart);
          const baseEffGpus = Math.min(baselineCluster.gpus, postScale(allTimeline(baselineStart), baselineStart));
          const completedPre = (effStrikeDate - baselineStart) * preEff * baseEffGpus * pEtaU;
          const remainPre = Math.max(0, preFLOPs - completedPre);
          fractionAtStrike = Math.min(completedPre / fEff, alpha);
          const survPhases = paretoPhases(survivingSites.flatMap(s => s.phases));
          for(const pt of survPhases) {
            const avail = Math.max(pt.year, postSearchFrom);
            const res = bestCompletionV2(pt.gpus, avail, survTimeline, remainPre, postFLOPs, attackAlgo, p, eta, u, postSearchFrom, postScale, postScale);
            if(res.done < earliestDone) { earliestDone = res.done; attackStart = res.start; attackPreEnd = res.preEnd; bestCluster = pt; bestStrategy = "mid-run migration"; }
          }
          scenario = "mid-pre";

        } else if (baseClusterHit && effStrikeDate >= baselinePreEnd) {
          const postEff = baselineAlgo(baselinePreEnd);
          const postTotalGpus = allTimeline(baselinePreEnd);
          const scaledPostGpus = postScale ? postScale(postTotalGpus, baselinePreEnd) : postTotalGpus;
          const completedPost = (effStrikeDate - baselinePreEnd) * postEff * scaledPostGpus * pEtaU;
          const remainPost = Math.max(0, postFLOPs - completedPost);
          fractionAtStrike = alpha + Math.min(completedPost / fEff, 1 - alpha);
          const survPhases = paretoPhases(survivingSites.flatMap(s => s.phases));
          for(const pt of survPhases) {
            const avail = Math.max(pt.year, postSearchFrom);
            const res = bestCompletionV2(pt.gpus, avail, survTimeline, 0, remainPost, attackAlgo, p, eta, u, postSearchFrom, postScale, postScale);
            if(res.done < earliestDone) { earliestDone = res.done; attackStart = res.start; attackPreEnd = effStrikeDate; bestCluster = pt; bestStrategy = "post-training migration"; }
          }
          scenario = "mid-post";

        } else {
          const remainPost = postFLOPs;
          const survPhases = paretoPhases(survivingSites.flatMap(s => s.phases));
          for(const pt of survPhases) {
            const avail = Math.max(pt.year, baselinePreEnd);
            const res = bestCompletionV2(pt.gpus, avail, survTimeline, 0, remainPost, attackAlgo, p, eta, u, baselinePreEnd, postScale, postScale);
            if(res.done < earliestDone) {
              const postOnlyTime = res.done - res.start;
              earliestDone = baselinePreEnd + postOnlyTime;
              attackStart = baselineStart; attackPreEnd = baselinePreEnd;
              bestCluster = baselineCluster; bestStrategy = "post-training degraded";
            }
          }
          scenario = "degraded";
        }
      }

      // An attack/SC disruption cannot make completion faster - clamp to baseline
      if (earliestDone < baselineDone) earliestDone = baselineDone;
      const frozenYears = earliestDone > (hasHits ? effStrikeDate : NOW) ? earliestDone - (hasHits ? effStrikeDate : NOW) : 0;
      const attackDelay = (earliestDone < Infinity && baselineDone < Infinity) ? Math.max(0, earliestDone - baselineDone) : (earliestDone === Infinity ? Infinity : 0);

      // === "Continuous denial" preemption count ===
      // Clusters effectively preempted = those above threshold with at least one
      // phase coming online between the strike and post-sabotage completion.
      // Planned clusters coming online AFTER completion don't affect the run, so
      // they're excluded from the count even if the physics treated them as preempted.
      // Display the denial-window-bounded preempted count (same window the physics uses).
      const preemptCutoff = preempt ? denialEnd : effStrikeDate;
      const preemptedEffectiveSites = preempt ? preemptedSites.filter(s =>
        s.phases.some(pt => pt.year <= preemptCutoff + 0.05)
      ) : [];
      const preemptedEffective = preemptedEffectiveSites.length;
      const preemptedEffectiveGPUs = preemptedEffectiveSites.reduce((s, site) => s + site.maxGpus, 0);

      // Sample algo multiplier curves for display (dense sampling to catch strike drops)
      const algoSampleYears = [];
      for (let yr = 2025; yr <= 2040; yr += 0.1) algoSampleYears.push(yr);
      // Add samples right at and after strike for sharp transitions
      if (effStrikeDate > NOW && effStrikeDate < 2040) {
        algoSampleYears.push(effStrikeDate - 0.01, effStrikeDate, effStrikeDate + 0.01, effStrikeDate + 0.05, effStrikeDate + 0.1);
      }
      algoSampleYears.sort((a, b) => a - b);
      const baselineAlgoSeries = algoSampleYears.map(yr => [yr, baselineAlgo(yr)]);
      const attackAlgoSeries = algoSampleYears.map(yr => [yr, attackAlgo(yr)]);

      // Instantaneous rate series (x/yr) for the rate chart
      const attackCompFn = hasHits ? attackCompanyFn : (scActive ? scOnlyCompanyFn : baselineCompanyFn);
      const baselineRateSeries = algoSampleYears.map(yr => [yr, algoYearly(baselineCompanyFn, refCompute, rate, yr, countryDiffusion, diffusionRefFn)]);
      const attackRateSeries = algoSampleYears.map(yr => [yr, algoYearly(attackCompFn, refCompute, rate, yr, countryDiffusion, diffusionRefFn)]);

      // Compute effective yearly multipliers at fixed years for display
      const algoRates = {};
      for (const yr of [2026, 2028, 2030]) {
        algoRates[`base${yr}`] = algoYearly(baselineCompanyFn, refCompute, rate, yr + 0.5, countryDiffusion, diffusionRefFn);
        algoRates[`atk${yr}`] = algoYearly(attackCompFn, refCompute, rate, yr + 0.5, countryDiffusion, diffusionRefFn);
      }

      // === PER-MILESTONE BASELINE COMPLETION DATES (no-strike) ===
      // For the scoreboard: best baseline completion date for each capability
      // milestone, using all original sites + baseline algo multiplier.
      // Also compute the POST-STRIKE date per milestone using the attack algo
      // multiplier + surviving sites only.
      const milestoneDates = {};
      const milestoneDatesAttack = {};
      const survPhasesForMS = paretoPhases(survivingSites.flatMap(s => s.phases));
      for (const m of MILESTONES) {
        const mExp = feb2025ToInternalExp(m.feb2025Log10);
        const mFEff = Math.pow(10, mExp);
        const mPre = alpha * mFEff, mPost = (1 - alpha) * mFEff;

        let bestDone = Infinity;
        for (const pt of allPhases) {
          const avail = Math.max(pt.year, NOW);
          const res = bestCompletionV2(pt.gpus, avail, allTimeline, mPre, mPost, baselineAlgo, p, eta, u, NOW, postScale, postScale);
          if (res.done < bestDone) bestDone = res.done;
        }
        milestoneDates[m.key] = bestDone;

        // Attack scenario:
        //   - If baseline completes BEFORE the strike, the milestone is already
        //     reached; the strike can't affect it (post-strike = baseline).
        //   - Otherwise, search for earliest completion using surviving sites
        //     and the attack-scenario algo multiplier.
        let attackDone = Infinity;
        const baselinePreStrike = isFinite(bestDone) && bestDone <= effStrikeDate;
        if (baselinePreStrike) {
          attackDone = bestDone;
        } else if (hasHits || scActive) {
          for (const pt of survPhasesForMS) {
            const avail = Math.max(pt.year, effStrikeDate);
            const res = bestCompletionV2(pt.gpus, avail, survTimeline, mPre, mPost, attackAlgo, p, eta, u, effStrikeDate, postScale, postScale);
            if (res.done < attackDone) attackDone = res.done;
          }
          // An attack can't make completion faster than the no-attack baseline
          if (attackDone < bestDone) attackDone = bestDone;
        } else {
          attackDone = bestDone;
        }
        milestoneDatesAttack[m.key] = attackDone;
      }

      // === ANALYTICAL STRIKE METRICS ===
      // Replace cluster-iteration metrics (disabled, disabledGPUs, preempted,
      // preemptedGPUs, preemptedEffective, preemptedEffectiveGPUs, totalSites,
      // totalGPUs) with deterministic expected values over the bucket model.
      // The cluster-iteration metrics above are still used for internal logic
      // (hasHits, scenario branching, bestCompletionV2 search) — those stay
      // sampled-based since they need cluster identities.
      //
      // Counts are kept fractional internally (more accurate); display sites
      // use Math.ceil for whole-cluster rendering.
      //
      // Guard: if scSites is empty (e.g., showAllGroups=false filtered out
      // Ally/Other), keep zeros to preserve the existing UI-conditional behavior.
      let outDisabled = disabledSites.length;
      let outDisabledGPUs = disabledGPUs;
      let outTotalGPUs = totalGPUs;
      let outTotalSites = totalSites;
      let outPreempted = preemptedSites.length;
      let outPreemptedGPUs = preemptedGPUs;
      let outPreemptedEffective = preemptedEffective;
      let outPreemptedEffectiveGPUs = preemptedEffectiveGPUs;
      let outDisabledExact = disabledSites.length;
      let outTotalSitesExact = totalSites;
      let outPreemptedExact = preemptedSites.length;
      let outPreemptedEffExact = preemptedEffective;
      if (scSites.length > 0) {
        const _analyticCs = scActive ? _analyticCsFor(country) : null;
        // For "preempted" (full count), no cutoff. For "preemptedEffective", use
        // training-completion cutoff so post-strike clusters built after the run
        // ends don't count.
        const _aFull = analyticalStrikeOutcome(
          country, effThreshold, effStrikeDate, preempt, _analyticCs,
          _analyticTxEnd, Infinity);
        const _aEff = analyticalStrikeOutcome(
          country, effThreshold, effStrikeDate, preempt, _analyticCs,
          _analyticTxEnd, preemptCutoff);
        outDisabledExact = _aFull.destroyedCount;
        outDisabled = Math.ceil(_aFull.destroyedCount);
        outDisabledGPUs = _aFull.destroyedCompute;
        outTotalSitesExact = _aFull.totalCount;
        outTotalSites = Math.ceil(_aFull.totalCount);
        outTotalGPUs = _aFull.totalCompute;
        outPreemptedExact = _aFull.preemptedCount;
        outPreempted = Math.ceil(_aFull.preemptedCount);
        outPreemptedGPUs = _aFull.preemptedCompute;
        outPreemptedEffExact = _aEff.preemptedCount;
        outPreemptedEffective = Math.ceil(_aEff.preemptedCount);
        outPreemptedEffectiveGPUs = _aEff.preemptedCompute;

        if (typeof window !== 'undefined' && window._maimDebugAnalytic) {
          const pctSampled = totalGPUs > 0 ? (disabledGPUs / totalGPUs * 100) : 0;
          const pctAnalytic = _aFull.totalCompute > 0
            ? (_aFull.destroyedCompute / _aFull.totalCompute * 100) : 0;
          // eslint-disable-next-line no-console
          console.log(`[analytic] ${country} T=${effThreshold} strike=${effStrikeDate.toFixed(2)}`, {
            sampled: {
              disabled: disabledSites.length,
              disabledGPUs: Math.round(disabledGPUs),
              totalGPUs: Math.round(totalGPUs),
              pctDestroyed: pctSampled.toFixed(1) + '%',
              preempted: preemptedSites.length,
              preemptedEffective,
              totalSites,
            },
            analytic: {
              disabled: outDisabled,
              disabledExact: outDisabledExact.toFixed(2),
              disabledGPUs: Math.round(outDisabledGPUs),
              totalGPUs: Math.round(outTotalGPUs),
              pctDestroyed: pctAnalytic.toFixed(1) + '%',
              preempted: outPreempted,
              preemptedEffective: outPreemptedEffective,
              totalSites: outTotalSites,
            },
          });
        }
      }

      return { total: outTotalSites, totalExact: outTotalSitesExact, disabled: outDisabled, disabledExact: outDisabledExact, disabledGPUs: outDisabledGPUs, totalGPUs: outTotalGPUs, preempted: outPreempted, preemptedExact: outPreemptedExact, preemptedGPUs: outPreemptedGPUs, preemptedEffective: outPreemptedEffective, preemptedEffectiveExact: outPreemptedEffExact, preemptedEffectiveGPUs: outPreemptedEffectiveGPUs, largest, earliestDone, frozenYears, bestCluster, bestStrategy, attackStart, attackPreEnd, baselineDone, baselineCluster, baselineStrategy, baselineStart, baselinePreEnd, attackDelay, scenario, fractionAtStrike, baselineAlgoSeries, attackAlgoSeries, baselineRateSeries, attackRateSeries, algoRates, milestoneDates, milestoneDatesAttack, _attackCompanyFn: attackCompFn, _timelines: { baseline: _baselineTL, attack: _attackTL, scOnly: _scOnlyTL }, _country: country };
    };

    // Compute US first so we can extract its actual company compute for CN diffusion
    const usS = computeStats("US", usNatEnabled, usNatDate, effCnAtkThreshold, effCnAtkStrikeDate, cnAtkSCActive, 0, null, cnAtkPreempt, cnAtkDenialYears);
    // CN's diffusion reference = what the US actually achieves (including nat + attack effects)
    const usActualCompanyFn = usS._attackCompanyFn;
    const cnS = computeStats("China", cnNatEnabled, cnNatDate, effUsAtkThreshold, effUsAtkStrikeDateSC, usAtkSCActive, diffusion, usActualCompanyFn, usAtkPreempt, usAtkDenialYears);
    const allyS = computeStats("Ally", false, 2050, effCnAtkThreshold, effCnAtkStrikeDate, cnAtkSCActive, 0, null, cnAtkPreempt, cnAtkDenialYears);
    const otherS = computeStats("Other", false, 2050, 1e11, NOW, false, 0, null, false);
    // Debug: expose the live scoreboard's stats so we can compare to sweep output.
    try {
      window.__liveStats = {
        US: { milestoneDates: usS.milestoneDates, milestoneDatesAttack: usS.milestoneDatesAttack,
              baselineDone: usS.baselineDone, earliestDone: usS.earliestDone,
              attackDelay: usS.attackDelay },
        China: { milestoneDates: cnS.milestoneDates, milestoneDatesAttack: cnS.milestoneDatesAttack,
                 baselineDone: cnS.baselineDone, earliestDone: cnS.earliestDone,
                 attackDelay: cnS.attackDelay },
        ui: { cnAtkEnabled, usAtkEnabled, cnAtkPctMode, usAtkPctMode,
              cnAtkPctDestroyed, usAtkPctDestroyed,
              cnAtkStrikeDate, usAtkStrikeDate, effCnAtkStrikeDate, effUsAtkStrikeDate,
              tsmcDestroyed, usStrikeCnFabs, diffusion, cnNatEnabled, usNatEnabled },
      };
    } catch (e) { /* ignore */ }
    return { usS, cnS, allyS, otherS };
    // Manual-trigger model: heavy stats only recompute when runVersion changes
    // (Run Model button) or when the AIFP backend toggle / fetch result changes.
    // Sliders (thresholds, dates, alpha, eta, etc.) update React state immediately
    // for the slider's own visual feedback, but the closure here re-reads them
    // only when this useMemo re-fires — so dragging stays smooth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runVersion, useAifpBackend, remoteAlgoFns]);

  // === AIFP backend fetch: assembles scenario payload and POSTs to Flask ===
  const scenarioDefs = useMemo(() => {
    const defs = [];
    // Backend alloc is FIXED at AIFP's canonical split (50% experiment, 5%
    // internal inference) for every scenario. Varying these per wartime state
    // triggers AIFP's internal calibration loop in confusing ways (r_software
    // recalibration + horizon-threshold recalibration don't cancel cleanly).
    // Wartime's training-allocation benefit flows through MAIM's local
    // postScale (alloc.training) in the training-run search below, which is
    // the physically correct channel for wartime's speedup.
    const _BACKEND_ALLOC = { experimental: 0.50, internal: 0.05 };
    const tls = usS?._timelines;
    if (tls) {
      defs.push({ id: "US-baseline", compute_timeline: tls.baseline, initial_progress: 0.0, alloc: _BACKEND_ALLOC });
      defs.push({ id: "US-attack",   compute_timeline: tls.attack,   initial_progress: 0.0, alloc: _BACKEND_ALLOC });
      defs.push({ id: "US-scOnly",   compute_timeline: tls.scOnly,   initial_progress: 0.0, alloc: _BACKEND_ALLOC });
    }
    if (MODEL_CHINA && cnS?._timelines) {
      const tl2 = cnS._timelines;
      // initial_progress = 0 for both countries: with shared calibration, the
      // compute-level gap alone produces a sensible CN-trailing trajectory.
      // Allocation matches US's _BACKEND_ALLOC for the same reason \u2014 the
      // backend keeps US-baseline's calibration fixed across all scenarios,
      // so per-country alloc differences only flow through to compute inputs.
      defs.push({ id: "China-baseline", compute_timeline: tl2.baseline, initial_progress: 0.0, alloc: _BACKEND_ALLOC });
      defs.push({ id: "China-attack",   compute_timeline: tl2.attack,   initial_progress: 0.0, alloc: _BACKEND_ALLOC });
      defs.push({ id: "China-scOnly",   compute_timeline: tl2.scOnly,   initial_progress: 0.0, alloc: _BACKEND_ALLOC });
    }
    return defs;
  }, [usS, cnS, alloc, cnAlloc]);

  // Memoize the key by content so reference-only changes to scenarioDefs
  // (which happen on every render that re-runs computeStats — e.g. after a
  // successful fetch updates remoteAlgoFns) don't retrigger the fetch effect.
  // Object.is on equal-content strings returns true, so the effect deps stay
  // stable until something genuinely changes the request body.
  const scenarioKey = useMemo(
    () => JSON.stringify([aifpPreset, aifpOverrides, scenarioDefs]),
    [aifpPreset, aifpOverrides, scenarioDefs]
  );

  useEffect(() => {
    if (!useAifpBackend || !scenarioDefs || scenarioDefs.length === 0) return;

    // Manual-trigger model: fetch fires on runVersion change (initial mount or
    // user clicking "Run model"). Sliders update local computations instantly
    // without re-firing the backend, so the user can adjust freely and only
    // pay the AIFP round-trip when they're ready.
    const aborter = new AbortController();
    lastFetchKeyRef.current = scenarioKey;
    setBackendStatus("loading");
    setBackendError("");

    fetch(AIFP_BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preset: aifpPreset,
        overrides: aifpOverrides,
        scenarios: scenarioDefs,
        time_range: [2017, 2040],
        initial_progress: 0.0,
      }),
      signal: aborter.signal,
    })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(data => {
        if (!data || !data.scenarios) throw new Error("no scenarios in response");
        const algoFns = {}, rateFns = {}, ms = {};
        for (const [id, s] of Object.entries(data.scenarios)) {
          if (s.error || !s.time || !s.algo_multiplier) continue;
          algoFns[id] = makeLogInterp(s.time, s.algo_multiplier);
          rateFns[id] = makeLinInterp(s.time, s.software_progress_rate || []);
          ms[id] = s.milestones_aifp_internal || {};
        }
        setRemoteAlgoFns(algoFns);
        setRemoteRateFns(rateFns);
        setRemoteMilestones(ms);
        setLastFetchedKey(scenarioKey);
        setBackendStatus("connected");
      })
      .catch(err => {
        if (err && err.name === "AbortError") return;
        console.error("AIFP backend fetch failed:", err);
        setBackendError(String(err));
        setBackendStatus("error");
      });

    return () => aborter.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useAifpBackend, runVersion]);

  // === Sweep framework: general N-axis parameter sweep over the model.
  // Builds attack scenarios in JS using the analytical helpers, batches them
  // into one AIFP POST per chunk, then replicates the scoreboard's training-
  // completion search per scenario. Reuse pattern:
  //
  //   await window.__sweep({
  //     defenders: ['US', 'China'],
  //     vary: {
  //       cnAtkStrikeDate: window.__sweepRange.monthly(NOW, 2032),
  //       cnAtkPctDestroyed: [50, 75, 90],
  //     },
  //     hold: { tsmcDestroyed: true, usAtkEnabled: false, cnAtkPreempt: false },
  //     measure: ['AC', 'SAR', 'TED-AI', 'SIAR', 'ASI'],
  //     include: ['target_count', 'sites_disabled', 'compute_destroyed_pct'],
  //   });
  //
  // Recognised vary axes (any state knob from the attack panels, plus
  // nationalization + training params + AIFP preset/overrides). Hold
  // overrides apply only inside the sweep; the live UI state is unchanged.
  useEffect(() => {
    // ---------- Range helpers ----------
    window.__sweepRange = {
      monthly: (start, end) => {
        const out = [];
        let y = Math.round(start * 12) / 12;
        while (y <= end + 1e-6) { out.push(Math.round(y * 10000) / 10000); y += 1/12; }
        return out;
      },
      linspace: (start, end, n) => Array.from({length: n}, (_, i) => start + i * (end - start) / Math.max(1, n - 1)),
      range: (start, end, step) => {
        const out = []; for (let v = start; v <= end + 1e-9; v += step) out.push(v); return out;
      },
    };

    // ---------- Generic helpers ----------
    function mkInterp(xs, ys) {
      return (t) => {
        if (t <= xs[0]) return ys[0];
        if (t >= xs[xs.length-1]) return ys[xs.length-1];
        let lo = 0, hi = xs.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= t) lo = mid; else hi = mid; }
        const f = (t - xs[lo]) / (xs[hi] - xs[lo]);
        return ys[lo] * (1 - f) + ys[hi] * f;
      };
    }
    const tlInterp = (tl) => mkInterp(tl.map(pp => pp[0]), tl.map(pp => pp[1]));
    function sampleTL(fn, refineAt) {
      const out = [];
      for (let y = 2024; y <= 2040.001; y += 1/12) out.push([y, Math.max(fn(y), 1)]);
      if (refineAt && refineAt > 2024 && refineAt < 2040) {
        out.push([refineAt - 1e-3, Math.max(fn(refineAt - 1e-3), 1)]);
        out.push([refineAt, Math.max(fn(refineAt), 1)]);
      }
      out.sort((a, b) => a[0] - b[0]);
      return out;
    }

    // ---------- Per-country baseline timelines (no strike) ----------
    function sitesForCountry(country) {
      const arr = ALL_CLUSTERS.filter(c => c.country === country && c.gpus >= 1000 && c.year >= 2022 && c.year < 2041);
      const map = {};
      arr.forEach((c, idx) => {
        const key = c.chain >= 0 ? "c"+c.chain : "s"+idx;
        if (!map[key]) map[key] = { phases: [] };
        map[key].phases.push({ year: c.year, gpus: c.gpus });
      });
      return { sites: Object.values(map), phases: arr.map(c => ({ year: c.year, gpus: c.gpus })) };
    }
    const _countryCache = {};
    function countryData(country) {
      if (_countryCache[country]) return _countryCache[country];
      const { sites, phases } = sitesForCountry(country);
      const allT = buildComputeTimeline(sites, NOW, 2041, 0.05);
      const actualShare = (t) => getCompanyShareOfNational(t);
      const baselineCompanyFn = (t) => allT(t) * actualShare(t);
      const baselineTL = sampleTL(baselineCompanyFn, null);
      _countryCache[country] = { sites, phases, allT, actualShare, baselineCompanyFn, baselineTL };
      return _countryCache[country];
    }

    // ---------- Per-sweep config helpers ----------
    function deriveSC(s) {
      const T = (s.tsmcDestroyed && s.cnAtkEnabled) ? 1 : 0;
      const D = (s.usStrikeCnFabs && s.usAtkEnabled) ? 1 : 0;
      const usSCFactor = (1 - 0.95 * T);
      const cnSCFactor = 0.484 * (1 - 0.95 * D) + 0.516 * (1 - 0.95 * T);
      return { T, D, usSCFactor, cnSCFactor, tsmcStrike: !!T, smicStrike: !!D };
    }
    function csFor(defender, s, sc) {
      if (defender === 'US') {
        if (sc.T === 0) return null; // no CN strike on US
        return { strikeYear: s.cnAtkStrikeDate, scFactor: sc.usSCFactor, tsmcStrike: sc.tsmcStrike };
      }
      if (defender === 'China') {
        if (sc.T === 0 && sc.D === 0) return null;
        const cnSCStrikeDate = Math.min(sc.T ? s.cnAtkStrikeDate : Infinity, sc.D ? s.usAtkStrikeDate : Infinity);
        return { strikeYear: cnSCStrikeDate, scFactor: sc.cnSCFactor, tsmcStrike: sc.tsmcStrike, smicStrike: sc.smicStrike };
      }
      return null;
    }
    function effStrikeDateFor(defender, s) {
      if (defender === 'US') return s.cnAtkEnabled ? s.cnAtkStrikeDate : null;
      if (defender === 'China') return s.usAtkEnabled ? s.usAtkStrikeDate : null;
      return null;
    }
    function txEndFor(s) {
      const dates = [];
      if (s.usAtkEnabled && isFinite(s.usAtkStrikeDate)) dates.push(s.usAtkStrikeDate);
      if (s.cnAtkEnabled && isFinite(s.cnAtkStrikeDate)) dates.push(s.cnAtkStrikeDate);
      return dates.length > 0 ? Math.min(...dates) : Infinity;
    }
    function effThresholdFor(defender, s, sc) {
      const isUs = defender === 'US';
      const enabled = isUs ? s.cnAtkEnabled : s.usAtkEnabled;
      if (!enabled) return Infinity;
      const pctMode = isUs ? s.cnAtkPctMode : s.usAtkPctMode;
      const sd = isUs ? s.cnAtkStrikeDate : s.usAtkStrikeDate;
      const preempt = isUs ? s.cnAtkPreempt : s.usAtkPreempt;
      const denialYears = isUs ? s.cnAtkDenialYears : s.usAtkDenialYears;
      const pct = isUs ? s.cnAtkPctDestroyed : s.usAtkPctDestroyed;
      const fixed = isUs ? s.cnAtkThreshold : s.usAtkThreshold;
      const cs = csFor(defender, s, sc);
      const txEnd = txEndFor(s);
      if (pctMode) return thresholdForPctDestroyed(defender, pct, sd, preempt, cs, txEnd, denialYears);
      return fixed;
    }

    // ---------- Snapshot current UI state for `hold` defaults ----------
    function takeStateSnapshot() {
      return {
        cnAtkStrikeDate, cnAtkEnabled, cnAtkPreempt, cnAtkPctMode, cnAtkPctDestroyed, cnAtkThreshold, cnAtkDenialYears,
        usAtkStrikeDate, usAtkEnabled, usAtkPreempt, usAtkPctMode, usAtkPctDestroyed, usAtkThreshold, usAtkDenialYears,
        tsmcDestroyed, usStrikeCnFabs,
        usNatEnabled, cnNatEnabled, usNatDate, cnNatDate,
      };
    }

    // ---------- Main entry ----------
    window.__sweep = async function(config) {
      const defenders = config.defenders || ['US'];
      const vary = config.vary || {};
      const hold = config.hold || {};
      const measure = config.measure || ['AC', 'SAR', 'TED-AI', 'SIAR', 'ASI'];
      const include = new Set(config.include || []);
      const aifpPresetCfg = config.aifpPreset || aifpPreset;
      const aifpOverridesCfg = config.aifpOverrides || aifpOverrides || {};
      const wartimePostScale = (_totalGpus, _time) => _totalGpus * alloc.training;
      const ALLOC = { experimental: 0.50, internal: 0.05 };

      // Per-milestone FLOP targets
      const milestoneTargets = {};
      for (const key of measure) {
        const m = MILESTONES.find(mm => mm.key === key);
        if (!m) continue;
        const fEff = Math.pow(10, m.feb2025Log10 - FLOP_EPOCH_SHIFT);
        milestoneTargets[key] = { pre: alpha * fEff, post: (1 - alpha) * fEff };
      }

      // Cartesian product of vary axes
      const axisNames = Object.keys(vary);
      let combos = [{}];
      for (const name of axisNames) {
        const vals = vary[name];
        const next = [];
        for (const c of combos) for (const v of vals) next.push({...c, [name]: v});
        combos = next;
      }
      const baseState = { ...takeStateSnapshot(), ...hold };
      // syncAxes: per-probe, mirror one axis's value into another field.
      // e.g. { cnAtkStrikeDate: 'usAtkStrikeDate' } makes CN strike happen at the same date as US strike.
      const syncAxes = config.syncAxes || {};

      // Build scenarios: one baseline per defender + one attack per (probe, defender).
      // ALWAYS include US-baseline as the calibration anchor — AIFP's
      // _select_calibration_scenario picks the scenario named exactly
      // "US-baseline" first, then any "US-" prefix, then scenarios[0]. If
      // US isn't in defenders, the previous code would let AIFP calibrate
      // r_software against (say) China's smaller compute series, producing
      // unrealistically early milestones. Matching the UI scoreboard's
      // behavior of always anchoring on US fixes this.
      const scenarios = [];
      const baselineIdFor = (def) => def === 'US' ? 'US-baseline' : `__baseline-${def}`;
      const usCd = countryData('US');
      scenarios.push({ id: 'US-baseline', compute_timeline: usCd.baselineTL, initial_progress: 0, alloc: ALLOC });
      for (const def of defenders) {
        if (def === 'US') continue;  // US-baseline already pushed above
        const cd = countryData(def);
        scenarios.push({ id: baselineIdFor(def), compute_timeline: cd.baselineTL, initial_progress: 0, alloc: ALLOC });
      }
      // baselineCount = total baseline scenarios at the front of `scenarios`
      const baselineCount = scenarios.length;
      const probeMeta = [];
      for (let i = 0; i < combos.length; i++) {
        const s = { ...baseState, ...combos[i] };
        // Apply syncAxes: copy value of srcKey into dstKey per probe.
        for (const [dstKey, srcKey] of Object.entries(syncAxes)) {
          if (srcKey in s) s[dstKey] = s[srcKey];
        }
        const sc = deriveSC(s);
        const perDef = {};
        for (const def of defenders) {
          const cd = countryData(def);
          const cs = csFor(def, s, sc);
          const effSd = effStrikeDateFor(def, s);
          const T = (effSd != null) ? effThresholdFor(def, s, sc) : Infinity;
          const denialYears = def === 'US' ? s.cnAtkDenialYears : s.usAtkDenialYears;
          const txEnd = txEndFor(s);
          // "Nat in response to strike": when usNatEnabled (or cnNatEnabled for
          // a China defender) is set in this probe, nationalization fires at
          // the strike date, lifting company share of national compute from
          // getCompanyShareOfNational(t) to 0.9. Pre-strike share is unchanged
          // (no strike yet to respond to), so the no-strike calibration anchor
          // is consistent across nat-on and nat-off probes.
          const natEnabled = !!(def === 'US' ? s.usNatEnabled : s.cnNatEnabled);
          const probeShare = (t) => (natEnabled && effSd != null && t >= effSd) ? 0.9 : getCompanyShareOfNational(t);
          let tl;
          if (effSd != null && isFinite(T)) {
            const _pctMode = def === 'US' ? s.cnAtkPctMode : s.usAtkPctMode;
            const _pct = def === 'US' ? s.cnAtkPctDestroyed : s.usAtkPctDestroyed;
            const _pctTarget = _pctMode ? _pct : null;
            const survT = analyticalSurvivingTimeline(def, T, effSd, def === 'US' ? s.cnAtkPreempt : s.usAtkPreempt, cs, txEnd, NOW, 2041, 0.05, denialYears, _pctTarget);
            const attackFn = (t) => (t < effSd) ? cd.baselineCompanyFn(t) : survT(t) * probeShare(t);
            tl = sampleTL(attackFn, effSd);
          } else {
            tl = cd.baselineTL;
          }
          const id = `__probe-${i}-${def}`;
          scenarios.push({ id, compute_timeline: tl, initial_progress: 0, alloc: ALLOC });
          perDef[def] = { id, cs, effSd, threshold: T, txEnd, natEnabled };
        }
        probeMeta.push({ idx: i, axes: combos[i], state: s, sc, perDef });
      }

      // POST in chunks (always include all baselines as calibration anchors)
      window.__sweepProgress = { phase: 'posting', done: 0, total: scenarios.length };
      const respMap = {};
      const CHUNK = 24;
      for (let i = baselineCount; i < scenarios.length; i += CHUNK) {
        const chunk = [...scenarios.slice(0, baselineCount), ...scenarios.slice(i, Math.min(i + CHUNK, scenarios.length))];
        const body = { preset: aifpPresetCfg, overrides: aifpOverridesCfg, scenarios: chunk, time_range: [2017, 2040], initial_progress: 0 };
        const resp = await fetch(AIFP_BACKEND_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const json = await resp.json();
        for (const [id, r] of Object.entries(json.scenarios || {})) respMap[id] = r;
        window.__sweepProgress.done = Math.min(i + CHUNK, scenarios.length);
      }

      // Milestone-completion helper.
      // Uses an ANALYTICAL EXPECTED max surviving cluster size (smooth in
      // threshold) rather than iterating discrete real clusters. This is the
      // option-(b) treatment: everything is expected-value so the curves are
      // smooth in strike date instead of step-changing whenever the threshold
      // crosses an individual real cluster's size.
      //   Attack: largest surviving cluster ≈ threshold (a sim cluster sits
      //     just below T in the bucket containing T). Available from the year
      //     the frontier first reaches T.
      //   Baseline (no strike): effGpus is left ~unbounded; pre-training is
      //     capped to the training budget via preScale anyway.
      function frontierAvailYear(targetGpus) {
        for (let y = Math.floor(NOW); y <= 2040; y++) {
          if (getMaxCluster(y) >= targetGpus) return Math.max(NOW, y);
        }
        return 2040;
      }
      // Build a per-probe training-compute extractor. Under nat (after strike),
      // the customer-inference workload is preserved at its counterfactual
      // no-nat level; the rest of the nationalized pool splits across
      // training/experimental/internal proportionally to their alloc shares.
      // companyTotal here is the trajectory value (= survT(t) * 0.9 post-strike
      // under nat, or survT(t) * share(t) post-strike under no-nat).
      function makePostScale(natEnabled, effSd) {
        if (!natEnabled || effSd == null) {
          return (companyTotal, _t) => companyTotal * alloc.training;
        }
        const denom = alloc.training + alloc.experimental + alloc.internal;
        const trainingShareOfInternal = alloc.training / denom;
        return (companyTotal, t) => {
          if (t < effSd) return companyTotal * alloc.training;
          const customerFrac = getCompanyShareOfNational(t) * alloc.customer / 0.9;
          const internalPool = Math.max(0, companyTotal * (1 - customerFrac));
          return internalPool * trainingShareOfInternal;
        };
      }

      // Build a list of candidate (cluster size, availability year) pairs to
      // try in bestCompletionV2 — matching the scoreboard's iteration over
      // real clusters. Candidates:
      //   - Real surviving cluster phases (Pareto-filtered), with SC reduction
      //     applied to post-strike phases. Pre-strike phases at or above
      //     threshold are destroyed and excluded.
      //   - countryMax(year) × SC factor at year, for each future AIFP year
      //     (max sim-cluster ceiling — relevant when real clusters get
      //     destroyed by a high-pct strike).
      //   - threshold as a fallback ceiling (max pre-strike surviving size).
      // For baselines: only need a single huge effGpus (the no-cap case).
      //
      // Previously omitted real-cluster phases, which caused discrete
      // delay jumps when the integer-year sim-cluster candidate's SC factor
      // crossed the phase-in boundary (visible as ~0.3 yr step changes around
      // strike-date 2031.5-2032 in SC-only sweeps).
      function clusterCandidatesFor(threshold, cs, country, strikeDate) {
        const candidates = [];
        const baseEff = Math.max(1000, threshold);
        candidates.push({ eff: baseEff, avail: frontierAvailYear(baseEff) });
        // Real surviving cluster phases. Pre-strike phases above threshold are
        // destroyed (excluded). Post-strike phases are at full size if cs===null
        // (cluster-only strike, no SC effect on future builds) or SC-reduced if
        // cs is set. The pre/post test uses strikeDate (always defined when
        // threshold is finite) rather than cs.strikeYear — same fix pattern as
        // analyticalSurvivingTimeline's isPreStrike, which previously over-
        // attributed destruction to future clusters in cluster-only scenarios.
        const sd = (typeof strikeDate === 'number' && isFinite(strikeDate)) ? strikeDate : (cs && cs.strikeYear != null ? cs.strikeYear : Infinity);
        const realPhases = [];
        for (const c of ALL_CLUSTERS) {
          if (c.country !== country) continue;
          if (c.gpus < 1000 || c.year < 2022 || c.year >= 2041) continue;
          const isPostStrike = c.year > sd && c.year > NOW;
          let gpus = c.gpus;
          if (isPostStrike) {
            if (cs && cs.strikeYear != null) {
              const factor = getRecoveredSCFactor(country, c.year, cs);
              gpus = Math.round(c.gpus * factor);
              if (gpus < 1000) continue;
            }
            // else: cluster-only, post-strike at full size
          } else {
            if (gpus >= threshold) continue;
          }
          realPhases.push({ gpus, year: Math.max(NOW, c.year) });
        }
        // Pareto-filter: keep only phases not dominated on both axes.
        realPhases.sort((a, b) => b.gpus - a.gpus);
        let earliestSoFar = Infinity;
        for (const p of realPhases) {
          if (p.year < earliestSoFar) {
            candidates.push({ eff: p.gpus, avail: p.year });
            earliestSoFar = p.year;
          }
        }
        // Sim-cluster ceiling candidates: for each future AIFP year, the max
        // sim cluster that can be built that year (with SC reduction if cs).
        const ceilingStart = isFinite(sd) ? Math.max(Math.ceil(sd), Math.floor(NOW)) : Math.floor(NOW);
        for (let y = ceilingStart; y <= 2040; y++) {
          const cm = getMaxCluster(y);
          const scF = (cs && cs.strikeYear != null) ? getPostStrikeFraction(country, y, cs) : 1.0;
          const sized = Math.round(cm * scF);
          if (sized > 1000) candidates.push({ eff: sized, avail: Math.max(NOW, y) });
        }
        return candidates;
      }

      function milestoneFor(scenarioId, _country, threshold, postScale, cs, strikeDate) {
        const r = respMap[scenarioId];
        if (!r || !r.time || !r.algo_multiplier) return null;
        const algoAt = mkInterp(r.time, r.algo_multiplier);
        const sc = scenarios.find(x => x.id === scenarioId);
        if (!sc) return null;
        const tlAt = tlInterp(sc.compute_timeline);
        const isAttack = isFinite(threshold);
        const ps = postScale || wartimePostScale;
        const out = {};
        if (!isAttack) {
          for (const key of measure) {
            const t = milestoneTargets[key];
            if (!t) { out[key] = null; continue; }
            const res = bestCompletionV2(1e12, NOW, tlAt, t.pre, t.post, algoAt, p, eta, u, NOW, ps, ps);
            out[key] = isFinite(res.done) ? res.done : null;
          }
        } else {
          const candidates = clusterCandidatesFor(threshold, cs, _country, strikeDate);
          for (const key of measure) {
            const t = milestoneTargets[key];
            if (!t) { out[key] = null; continue; }
            let bestDone = Infinity;
            for (const cand of candidates) {
              const res = bestCompletionV2(cand.eff, cand.avail, tlAt, t.pre, t.post, algoAt, p, eta, u, NOW, ps, ps);
              if (res.done < bestDone) bestDone = res.done;
            }
            out[key] = isFinite(bestDone) ? bestDone : null;
          }
        }
        return out;
      }

      // Compute baseline milestones per defender (no-strike, no-nat — nat only
      // fires in response to a strike, and there's no strike in the baseline)
      const baseline = {};
      for (const def of defenders) {
        baseline[def] = milestoneFor(baselineIdFor(def), def, Infinity, wartimePostScale);
      }

      // Compute per-probe milestones + extras
      const probes = probeMeta.map(p => {
        const stats = {};
        for (const def of defenders) {
          const meta = p.perDef[def];
          const probePostScale = makePostScale(meta.natEnabled, meta.effSd);
          const ms = milestoneFor(meta.id, def, meta.threshold, probePostScale, meta.cs, meta.effSd);
          const bl = baseline[def];
          const delays = {};
          for (const key of measure) {
            // No clamp on negative delays — nationalization can push a milestone
            // earlier than the no-nat no-strike baseline, and we want to surface
            // that.
            delays['delay_' + key] = (ms && bl && ms[key] != null && bl[key] != null) ? ms[key] - bl[key] : null;
          }
          const out = { ...ms, ...delays, threshold: meta.threshold };
          if (include.has('target_count') || include.has('sites_disabled') || include.has('sites_preempted') || include.has('compute_destroyed_pct') || include.has('compute_destroyed_h100e')) {
            // Relaxed: compute target_count for cluster-only too (cs may be null).
            if (isFinite(meta.threshold) && meta.effSd != null) {
              const a = analyticalStrikeOutcome(def, meta.threshold, meta.effSd,
                def === 'US' ? p.state.cnAtkPreempt : p.state.usAtkPreempt,
                meta.cs, meta.txEnd,
                meta.cs ? meta.effSd + (def === 'US' ? p.state.cnAtkDenialYears : p.state.usAtkDenialYears) : Infinity);
              if (include.has('target_count')) out.target_count = Math.round(a.destroyedCount + a.preemptedCount);
              if (include.has('sites_disabled')) out.sites_disabled = Math.round(a.destroyedCount);
              if (include.has('sites_preempted')) out.sites_preempted = Math.round(a.preemptedCount);
              if (include.has('compute_destroyed_h100e')) out.compute_destroyed_h100e = Math.round(a.destroyedCompute);
              if (include.has('compute_destroyed_pct')) out.compute_destroyed_pct = a.totalCompute > 0 ? Math.round(a.destroyedCompute / a.totalCompute * 100) : 0;
            }
          }
          stats[def] = out;
        }
        return { axes: p.axes, stats };
      });

      const result = { config: { defenders, vary, hold, measure, include: [...include], aifpPreset: aifpPresetCfg, aifpOverrides: aifpOverridesCfg }, baseline, probes };
      window.__sweepResult = result;
      window.__sweepProgress = { phase: 'done', done: scenarios.length, total: scenarios.length };
      return result;
    };

    // ---------- Plotter ----------
    // window.__plotSweep(result, opts) — render a line plot of a sweep result
    // in a new popup window. Mirrors plot_sweep.py's line-plot behavior.
    //
    //   __plotSweep(window.__sweepResult);
    //   __plotSweep(r, { measure: 'ASI', metric: 'target_count' });
    //
    // opts:
    //   measure: 'SAR' (default: first in result.config.measure)
    //   defender: 'US' (default: all defenders in result)
    //   metric: 'delay' | 'absolute' | 'target_count' | 'sites_disabled' |
    //           'sites_preempted' | 'compute_destroyed_pct' |
    //           'compute_destroyed_h100e' | 'threshold' (default: 'delay')
    //   unit: 'months' | 'years' (default: 'months') — for delay only
    //   x: vary-axis name (default: longest)
    //   title: chart title
    //
    // Future enhancements tracked in PLOTTER_TODO.md in the project dir.
    function __plotSweep(result, opts) {
      opts = opts || {};
      const cfg = result.config || {};
      const probes = result.probes || [];
      if (!probes.length) { alert('no probes'); return; }
      const defenders = opts.defender ? [opts.defender] : (cfg.defenders || ['US']);
      const measures = opts.measure ? [opts.measure] : (cfg.measure || ['SAR']);
      const metric = opts.metric || 'delay';
      const unit = opts.unit || 'months';
      const axisNames = Object.keys(cfg.vary || {});
      if (!axisNames.length) { alert('sweep had no vary axes'); return; }
      const axisValues = {};
      for (const n of axisNames) axisValues[n] = cfg.vary[n].slice();
      const xAxis = (opts.x && axisValues[opts.x]) ? opts.x : axisNames.reduce((a, b) => axisValues[a].length >= axisValues[b].length ? a : b);
      const seriesAxes = axisNames.filter(n => n !== xAxis);
      const xIsDate = axisValues[xAxis].every(v => typeof v === 'number' && v > 2020 && v < 2050);
      const perDefPerMs = metric === 'delay' || metric === 'absolute';

      function getY(probe, def, ms) {
        const s = (probe.stats || {})[def] || {};
        if (metric === 'delay') {
          const v = s['delay_' + ms];
          return v == null ? null : (unit === 'months' ? v * 12 : v);
        }
        if (metric === 'absolute') return s[ms] ?? null;
        return s[metric] ?? null;
      }
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      function fmtDateYear(yr) {
        const y = Math.floor(yr); const mo = Math.round((yr - y) * 12);
        return MONTHS[mo % 12] + ' ' + y;
      }
      function fmtSeries(name, value) {
        if (typeof value === 'boolean') return name + '=' + (value ? 'on' : 'off');
        if (typeof value === 'number') {
          if (name.endsWith('StrikeDate') && value > 2020 && value < 2050) return fmtDateYear(value);
          if (name.endsWith('Threshold') && value >= 1000) return name + '=' + (value/1000).toFixed(0) + 'K';
          return name + '=' + value;
        }
        return name + '=' + value;
      }

      // Build series combos
      let combos = [{}];
      for (const n of seriesAxes) {
        const next = [];
        for (const c of combos) for (const v of axisValues[n]) next.push({...c, [n]: v});
        combos = next;
      }

      // Collect all series (label, xs, ys)
      const series = [];
      for (const def of defenders) {
        const msList = perDefPerMs ? measures : [null];
        for (const ms of msList) {
          for (const combo of combos) {
            const pts = [];
            for (const p of probes) {
              let match = true;
              for (const k in combo) if (p.axes[k] !== combo[k]) { match = false; break; }
              if (!match) continue;
              const x = p.axes[xAxis];
              const y = getY(p, def, ms);
              if (x != null) pts.push([x, y]);
            }
            pts.sort((a, b) => a[0] - b[0]);
            const labelParts = [];
            if (defenders.length > 1) labelParts.push(def);
            if (ms && msList.length > 1) labelParts.push(ms);
            for (const k in combo) labelParts.push(fmtSeries(k, combo[k]));
            const label = labelParts.join(' · ') || (defenders.length === 1 ? def : '');
            series.push({ label, pts });
          }
        }
      }

      // Determine bounds
      const allX = []; const allY = [];
      for (const s of series) for (const [x, y] of s.pts) { allX.push(x); if (y != null && isFinite(y)) allY.push(y); }
      const xMin = Math.min(...allX), xMax = Math.max(...allX);
      const yMin = Math.min(0, ...allY), yMax = Math.max(...allY);
      const yPad = (yMax - yMin) * 0.05;

      // Render SVG
      const W = 1100, H = 600;
      const M = { l: 70, r: 240, t: 50, b: 70 };
      const pw = W - M.l - M.r, ph = H - M.t - M.b;
      const xS = v => M.l + (v - xMin) / (xMax - xMin || 1) * pw;
      const yS = v => M.t + ph - (v - yMin) / ((yMax + yPad) - yMin || 1) * ph;

      const colors = ['#3b82f6','#f59e0b','#ef4444','#10b981','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#a855f7'];

      const svg = [];
      svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:white;font-family:system-ui,sans-serif">`);
      // title
      const title = opts.title || (metric + ' vs ' + xAxis);
      svg.push(`<text x="${W/2}" y="22" text-anchor="middle" font-size="14" font-weight="600">${title}</text>`);
      // axes
      svg.push(`<line x1="${M.l}" y1="${M.t+ph}" x2="${M.l+pw}" y2="${M.t+ph}" stroke="#222"/>`);
      svg.push(`<line x1="${M.l}" y1="${M.t}" x2="${M.l}" y2="${M.t+ph}" stroke="#222"/>`);
      // y ticks
      const yTickN = 8;
      for (let i = 0; i <= yTickN; i++) {
        const v = yMin + (yMax + yPad - yMin) * i / yTickN;
        const yp = yS(v);
        svg.push(`<line x1="${M.l}" y1="${yp}" x2="${M.l+pw}" y2="${yp}" stroke="#eee"/>`);
        svg.push(`<text x="${M.l-6}" y="${yp+4}" text-anchor="end" font-size="10">${v.toFixed(1)}</text>`);
      }
      // x ticks
      const xTickN = Math.min(12, Math.max(4, axisValues[xAxis].length));
      for (let i = 0; i <= xTickN; i++) {
        const v = xMin + (xMax - xMin) * i / xTickN;
        const xp = xS(v);
        svg.push(`<line x1="${xp}" y1="${M.t+ph}" x2="${xp}" y2="${M.t+ph+5}" stroke="#222"/>`);
        const label = xIsDate ? fmtDateYear(v) : v.toFixed(2);
        svg.push(`<text x="${xp}" y="${M.t+ph+18}" text-anchor="middle" font-size="10">${label}</text>`);
      }
      // x-axis label
      svg.push(`<text x="${M.l+pw/2}" y="${H-12}" text-anchor="middle" font-size="11">${xAxis}</text>`);
      // y-axis label
      const yLabel = metric === 'delay' ? `Delay (${unit})` : metric === 'absolute' ? 'Milestone year' : metric;
      svg.push(`<text x="20" y="${M.t+ph/2}" text-anchor="middle" font-size="11" transform="rotate(-90 20 ${M.t+ph/2})">${yLabel}</text>`);
      // series lines
      series.forEach((s, i) => {
        const color = colors[i % colors.length];
        const pts = s.pts.filter(p => p[1] != null && isFinite(p[1]));
        if (!pts.length) return;
        const path = pts.map((p, j) => (j === 0 ? 'M' : 'L') + xS(p[0]).toFixed(1) + ',' + yS(p[1]).toFixed(1)).join(' ');
        svg.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="1.6"/>`);
        for (const p of pts) svg.push(`<circle cx="${xS(p[0]).toFixed(1)}" cy="${yS(p[1]).toFixed(1)}" r="2.5" fill="${color}"/>`);
      });
      // legend
      const lgX = M.l + pw + 16, lgY = M.t;
      svg.push(`<rect x="${lgX-4}" y="${lgY-8}" width="${M.r-24}" height="${Math.min(series.length, 20)*18+12}" fill="white" stroke="#ddd"/>`);
      series.slice(0, 20).forEach((s, i) => {
        const color = colors[i % colors.length];
        const ly = lgY + i * 18 + 4;
        svg.push(`<line x1="${lgX}" y1="${ly}" x2="${lgX+18}" y2="${ly}" stroke="${color}" stroke-width="2"/>`);
        svg.push(`<circle cx="${lgX+9}" cy="${ly}" r="2.5" fill="${color}"/>`);
        const esc = (s.label || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
        svg.push(`<text x="${lgX+24}" y="${ly+4}" font-size="10">${esc}</text>`);
      });
      svg.push(`</svg>`);

      // Open popup
      const html = `<!doctype html><html><head><title>${title}</title><style>body{margin:8px;background:#f8fafc}</style></head><body>${svg.join('')}<div style="margin-top:8px;font:11px system-ui,sans-serif;color:#64748b">Right-click the chart → "Save image as…" to export as SVG/PNG.</div></body></html>`;
      const w = window.open('', '_blank', 'width=' + (W+40) + ',height=' + (H+80));
      if (!w) { alert('popup blocked'); return; }
      w.document.write(html);
      w.document.close();
    }
    window.__plotSweep = __plotSweep;
    // Convenience: run sweep + plot in one call
    window.__sweepAndPlot = async function(config, plotOpts) {
      const r = await window.__sweep(config);
      __plotSweep(r, plotOpts);
      return r;
    };

    // Backwards-compat wrapper for the old narrow API used by sweep_us_sar_delay.csv etc.
    window.__sweepUsSar = async function(pctList, sdList) {
      const r = await window.__sweep({
        defenders: ['US'],
        vary: { cnAtkPctDestroyed: pctList, cnAtkStrikeDate: sdList },
        hold: { usAtkEnabled: false, cnAtkPctMode: true, cnAtkPreempt: false, tsmcDestroyed: true },
        measure: ['SAR'],
      });
      return {
        baseline_sar: r.baseline.US?.SAR,
        results: r.probes.map(p => ({
          pct: p.axes.cnAtkPctDestroyed,
          sd: p.axes.cnAtkStrikeDate,
          threshold: Math.round(p.stats.US.threshold),
          post_sar: p.stats.US.SAR,
          delay_yrs: p.stats.US.delay_SAR,
        })),
      };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alpha, p, eta, u, alloc, aifpPreset, aifpOverrides,
      cnAtkStrikeDate, cnAtkEnabled, cnAtkPreempt, cnAtkPctMode, cnAtkPctDestroyed, cnAtkThreshold, cnAtkDenialYears,
      usAtkStrikeDate, usAtkEnabled, usAtkPreempt, usAtkPctMode, usAtkPctDestroyed, usAtkThreshold, usAtkDenialYears,
      tsmcDestroyed, usStrikeCnFabs, usNatEnabled, cnNatEnabled, usNatDate, cnNatDate]);

  // === Projection data from AIFP ===
  const projections = useMemo(() => {
    const anySCActive = usAtkSCActive || cnAtkSCActive;
    const anyStrike = usAtkEnabled || cnAtkEnabled;

    // Time-varying country shares: transition from SHARES_NOW to SHARES_AT_STRIKE
    // by the earliest enabled strike date (BIS export-control tightening preceding
    // kinetic strikes). If no strikes are enabled, no transition — shares stay at NOW.
    const txEnd = (() => {
      const dates = [];
      if (usAtkEnabled && isFinite(effUsAtkStrikeDate)) dates.push(effUsAtkStrikeDate);
      if (cnAtkEnabled && isFinite(effCnAtkStrikeDate)) dates.push(effCnAtkStrikeDate);
      return dates.length > 0 ? Math.min(...dates) : Infinity;
    })();

    // Direct destruction: GPUs destroyed at strike date (permanent subtraction)
    const destroyed = {
      US: cnAtkEnabled ? usS.disabledGPUs : 0,
      China: usAtkEnabled ? cnS.disabledGPUs : 0,
      Ally: cnAtkEnabled ? allyS.disabledGPUs : 0,
      Other: 0,
    };
    const strikeYears = {
      US: cnAtkEnabled ? effCnAtkStrikeDate : Infinity,
      China: usAtkEnabled ? effUsAtkStrikeDate : Infinity,
      Ally: cnAtkEnabled ? effCnAtkStrikeDate : Infinity,
      Other: Infinity,
    };

    // Per-country growth adjustment: SC slows future growth, direct strikes subtract existing compute
    function buildAdjusted() {
      const countryAdj = { US: [], China: [], Ally: [], Other: [] };
      const tsmcStrikeFlag = (tsmcDestroyed && cnAtkEnabled);
      const smicStrikeFlag = (usStrikeCnFabs && usAtkEnabled);
      const csByCountry = {
        US: cnAtkSCActive ? { strikeYear: cnAtkStrikeDate, scFactor: usSCFactor, tsmcStrike: tsmcStrikeFlag } : null,
        China: usAtkSCActive ? { strikeYear: cnSCStrikeDate, scFactor: cnSCFactor, tsmcStrike: tsmcStrikeFlag, smicStrike: smicStrikeFlag } : null,
        Ally: cnAtkSCActive ? { strikeYear: cnAtkStrikeDate, scFactor: usSCFactor, tsmcStrike: tsmcStrikeFlag } : null,
        Other: null,
      };
      for (const c of Object.keys(countryAdj)) {
        let prev = null;
        let destructionApplied = false;

        // Precompute the strike-year baseline addition for this country: this is
        // the no-strike country-specific increment AT the strike year, used to anchor
        // post-strike additions (so they don't compound with exponential growth).
        const csForCountry = csByCountry[c];
        let strikeYearAddition = null;
        if (csForCountry && csForCountry.strikeYear != null) {
          const strikeYr = Math.floor(csForCountry.strikeYear);
          for (let j = 1; j < AIFP_DATA.length; j++) {
            if (AIFP_DATA[j][0] === strikeYr) {
              const sharesJ = getCountryShares(AIFP_DATA[j][0], txEnd);
              const sharesJm1 = getCountryShares(AIFP_DATA[j - 1][0], txEnd);
              const shareJ = sharesJ[c] || sharesJ.Other || 0.038;
              const shareJm1 = sharesJm1[c] || sharesJm1.Other || 0.038;
              strikeYearAddition = Math.max(
                0,
                AIFP_DATA[j][1] * shareJ - AIFP_DATA[j - 1][1] * shareJm1
              );
              break;
            }
          }
        }

        for (let i = 0; i < AIFP_DATA.length; i++) {
          const [yr, g] = AIFP_DATA[i];
          const yearShares = getCountryShares(yr, txEnd);
          const share = yearShares[c] || yearShares.Other || 0.038;
          const countryG = g * share;

          let val;
          if (i === 0 || prev === null) {
            val = countryG;
          } else {
            const prevYr = AIFP_DATA[i - 1][0];
            const prevShares = getCountryShares(prevYr, txEnd);
            const prevShare = prevShares[c] || prevShares.Other || 0.038;
            const prevOrig = AIFP_DATA[i - 1][1] * prevShare;
            const origGrowth = Math.max(0, countryG - prevOrig);

            // Post-strike model: baseline_frac × G(t), permanent (no recovery).
            // Pre-strike portion of strike year uses full counterfactual; post-strike portion
            // scales by the integrated phase-in × baseline factor against country-specific shares.
            const cs = csByCountry[c];
            let growthAddition = origGrowth;
            let scActive = false;
            if (cs) {
              const effectiveStrike = cs.strikeYear + SC_PIPELINE_DELAY;
              const preFrac = Math.max(0, Math.min(1, effectiveStrike - yr));
              if (preFrac < 1) {
                // Integrate SC factor over the post-strike portion of year yr
                // (matches the analytical functions and the sampler).
                const psStart = Math.max(yr - effectiveStrike, 0);
                const psEnd = (yr + 1) - effectiveStrike;
                const postStrikeFraction = avgPostStrikeFactor(c, cs, psStart, psEnd);
                growthAddition = preFrac * origGrowth + (1 - preFrac) * postStrikeFraction * origGrowth;
                scActive = true;
              }
            }

            // If no destruction yet and no SC, use baseline
            if (!destructionApplied && !scActive) {
              val = countryG;
            } else {
              // Build incrementally on (possibly reduced) prev
              val = prev + growthAddition;
            }
          }

          // Apply direct destruction step-down once
          if (!destructionApplied && yr >= strikeYears[c] && destroyed[c] > 0) {
            val = Math.max(0, val - destroyed[c]);
            destructionApplied = true;
          }

          countryAdj[c].push(val);
          prev = val;
        }
      }
      return countryAdj;
    }

    const needsAdjustment = anySCActive || anyStrike;
    const countryAdj = needsAdjustment ? buildAdjusted() : null;
    const getAdj = (c, i) => {
      if (countryAdj) return countryAdj[c][i];
      const [yr, g] = AIFP_DATA[i];
      const yearShares = getCountryShares(yr, txEnd);
      return g * (yearShares[c] || 0.038);
    };

    // Build adjusted global total and series
    const adjustedAIFP = AIFP_DATA.map(([yr, g, sharePct, c], i) => {
      if (!needsAdjustment) return [yr, g, sharePct, c];
      const adjGlobal = (countryAdj.US[i] || 0) + (countryAdj.China[i] || 0) + (countryAdj.Ally[i] || 0) + (countryAdj.Other[i] || 0);
      const ratio = g > 0 ? adjGlobal / g : 1;
      return [yr, adjGlobal, sharePct, c * ratio];
    });

    const globalSeries = adjustedAIFP.map(([yr, g]) => [yr, g]);
    const usTotalSeries = AIFP_DATA.map(([yr], i) => [yr, getAdj("US", i)]);
    const chinaTotalSeries = AIFP_DATA.map(([yr], i) => [yr, getAdj("China", i)]);

    // Helper: interpolate a [[year, value], ...] sampled timeline at a given year
    const interpTL = (pts, year) => {
      if (!pts || pts.length === 0) return null;
      if (year <= pts[0][0]) return pts[0][1];
      if (year >= pts[pts.length-1][0]) return pts[pts.length-1][1];
      for (let i = 0; i < pts.length - 1; i++) {
        if (pts[i][0] <= year && year <= pts[i+1][0]) {
          const frac = (year - pts[i][0]) / (pts[i+1][0] - pts[i][0]);
          return pts[i][1] + frac * (pts[i+1][1] - pts[i][1]);
        }
      }
      return pts[pts.length-1][1];
    };

    // Leading-company series (US and China). When strikes are active, prefer
    // the exact post-strike timeline from computeStats (survTimeline x share),
    // which reflects continuous denial of future planned clusters too.
    const usLeadingSeries = AIFP_DATA.map(([yr, g, , c], i) => {
      if (anyStrike && usS?._timelines?.attack) {
        const v = interpTL(usS._timelines.attack, yr);
        if (v != null) return [yr, v];
      }
      const usT = getAdj("US", i);
      if (usNatEnabled && yr >= usNatDate) return [yr, usT * 0.9];
      const origUsT = g * getCountryShares(yr, txEnd).US;
      const share = origUsT > 0 ? c / origUsT : 0;
      return [yr, usT * share];
    });
    const chinaLeadingSeries = AIFP_DATA.map(([yr, g, , c], i) => {
      if (anyStrike && cnS?._timelines?.attack) {
        const v = interpTL(cnS._timelines.attack, yr);
        if (v != null) return [yr, v];
      }
      const cnT = getAdj("China", i);
      if (cnNatEnabled && yr >= cnNatDate) return [yr, cnT * 0.9];
      const origUsT = g * getCountryShares(yr, txEnd).US;
      const share = origUsT > 0 ? c / origUsT : 0;
      return [yr, cnT * share];
    });
    // === Sub-year refinement at strike dates ===
    // The series above are sampled at integer years (AIFP_DATA), which smears
    // strike-date discontinuities visually across the strike year. For Jan
    // strikes the line drops between (year-1) and (year); for Feb-Dec strikes
    // it drops between (year) and (year+1). Inject (strikeDate - eps) and
    // (strikeDate) sample points so the chart shows the drop AT the strike.
    const _refineWithStrike = (series, strikeDate, before, after) => {
      if (!Number.isFinite(strikeDate)) return series;
      if (before == null || after == null) return series;
      const eps = 1e-3;
      // Drop the integer-year point at the strike year. Its value via
      // buildAdjusted is a mix of pre-strike growth + post-strike growth +
      // destruction integrated over the year, which conflicts with our
      // explicit (strikeDate-eps, baseline) and (strikeDate, after-destruction)
      // refinement points. The line then linearly interpolates from the
      // after-destruction point to the next integer year, which is the
      // correct visual representation of post-strike trajectory.
      const strikeYr = Math.floor(strikeDate);
      const filtered = series.filter(([x]) => x !== strikeYr);
      return [...filtered, [strikeDate - eps, before], [strikeDate, after]]
        .sort((a, b) => a[0] - b[0]);
    };
    const _baselineCountryAt = (country, t) => {
      const yrBefore = Math.floor(t);
      const idxBefore = AIFP_DATA.findIndex(d => d[0] === yrBefore);
      if (idxBefore < 0 || idxBefore + 1 >= AIFP_DATA.length) return null;
      const yrAfter = AIFP_DATA[idxBefore + 1][0];
      const sB = getCountryShares(yrBefore, txEnd)[country] || 0;
      const sA = getCountryShares(yrAfter, txEnd)[country] || 0;
      const valBefore = AIFP_DATA[idxBefore][1] * sB;
      const valAfter  = AIFP_DATA[idxBefore + 1][1] * sA;
      const frac = (t - yrBefore) / (yrAfter - yrBefore);
      return valBefore + frac * (valAfter - valBefore);
    };
    const _baselineGlobalAt = (t) => {
      const yrBefore = Math.floor(t);
      const idxBefore = AIFP_DATA.findIndex(d => d[0] === yrBefore);
      if (idxBefore < 0 || idxBefore + 1 >= AIFP_DATA.length) return null;
      const yrAfter = AIFP_DATA[idxBefore + 1][0];
      const valBefore = AIFP_DATA[idxBefore][1];
      const valAfter  = AIFP_DATA[idxBefore + 1][1];
      const frac = (t - yrBefore) / (yrAfter - yrBefore);
      return valBefore + frac * (valAfter - valBefore);
    };
    // Refinement is applied to SEPARATE display series only. The originals
    // (usTotalSeries, usLeadingSeries, etc.) stay aligned with AIFP_DATA's
    // integer-year index, so adjAifpAt's indexed access remains correct for
    // year-based stat displays like "Lead co. 2035".
    let usTotalDisp = usTotalSeries, chinaTotalDisp = chinaTotalSeries;
    let usLeadingDisp = usLeadingSeries, chinaLeadingDisp = chinaLeadingSeries;
    let globalDisp = globalSeries;
    if (cnAtkEnabled && Number.isFinite(cnAtkStrikeDate) && cnAtkStrikeDate >= 2024 && cnAtkStrikeDate <= 2040) {
      const sd = cnAtkStrikeDate;
      const totBefore = _baselineCountryAt("US", sd);
      const destroyed = (usS && usS.disabledGPUs) || 0;
      const allyDestroyed = (allyS && allyS.disabledGPUs) || 0;
      if (totBefore != null) {
        usTotalDisp = _refineWithStrike(usTotalDisp, sd, totBefore, Math.max(0, totBefore - destroyed));
      }
      const tlA = usS?._timelines?.attack;
      if (tlA) {
        const lb = interpTL(tlA, sd - 1e-3);
        const la = interpTL(tlA, sd);
        usLeadingDisp = _refineWithStrike(usLeadingDisp, sd, lb, la);
      }
      const gBefore = _baselineGlobalAt(sd);
      if (gBefore != null) {
        globalDisp = _refineWithStrike(globalDisp, sd, gBefore, Math.max(0, gBefore - destroyed - allyDestroyed));
      }
    }
    if (usAtkEnabled && Number.isFinite(usAtkStrikeDate) && usAtkStrikeDate >= 2024 && usAtkStrikeDate <= 2040) {
      const sd = usAtkStrikeDate;
      const totBefore = _baselineCountryAt("China", sd);
      const destroyed = (cnS && cnS.disabledGPUs) || 0;
      if (totBefore != null) {
        chinaTotalDisp = _refineWithStrike(chinaTotalDisp, sd, totBefore, Math.max(0, totBefore - destroyed));
      }
      const tlA = cnS?._timelines?.attack;
      if (tlA) {
        const lb = interpTL(tlA, sd - 1e-3);
        const la = interpTL(tlA, sd);
        chinaLeadingDisp = _refineWithStrike(chinaLeadingDisp, sd, lb, la);
      }
      const gBefore = _baselineGlobalAt(sd);
      if (gBefore != null) {
        const existing = globalDisp.find(([x]) => Math.abs(x - sd) < 1e-9);
        const after = existing
          ? Math.max(0, existing[1] - destroyed)
          : Math.max(0, gBefore - destroyed);
        globalDisp = _refineWithStrike(globalDisp, sd, gBefore, after);
      }
    }

    // Training/experimental are display-only (no indexed access elsewhere),
    // so we derive them from the refined leading series.
    const usTrainingSeries = usLeadingDisp.map(([yr, v]) => [yr, v * alloc.training]);
    const cnTrainingSeries = chinaLeadingDisp.map(([yr, v]) => [yr, v * cnAlloc.training]);
    const usExperimentalSeries = usLeadingDisp.map(([yr, v]) => [yr, v * alloc.experimental]);
    const cnExperimentalSeries = chinaLeadingDisp.map(([yr, v]) => [yr, v * cnAlloc.experimental]);

    const adjAifpAt = (year) => {
      const idx = AIFP_DATA.findIndex(([y]) => y === year);
      if (idx < 0) return null;
      const [, g, , c] = adjustedAIFP[idx];
      const usT = getAdj("US", idx), cnT = getAdj("China", idx);
      const natShare = usT > 0 ? c / (g || 1) * (g || 1) / usT : 0;
      return { global: g, usTotal: usT, cnTotal: cnT, usLead: usLeadingSeries[idx][1], cnLead: chinaLeadingSeries[idx][1], natShare };
    };

    // Charts read the display (refined) versions so strike-date discontinuities
    // align with strikeDate visually. adjAifpAt (closed over above) reads the
    // original integer-year series for stable indexed access.
    return {
      globalSeries: globalDisp,
      usTotalSeries: usTotalDisp,
      chinaTotalSeries: chinaTotalDisp,
      usLeadingSeries: usLeadingDisp,
      chinaLeadingSeries: chinaLeadingDisp,
      usTrainingSeries, cnTrainingSeries, usExperimentalSeries, cnExperimentalSeries,
      baselineGlobalSeries: AIFP_DATA.map(([yr, g]) => [yr, g]),
      globalNewSeries: adjustedAIFP.slice(1).map(([yr, g], i) => [yr, g - adjustedAIFP[i][1]]),
      baselineNewSeries: AIFP_DATA.slice(1).map(([yr, g], i) => [yr, g - AIFP_DATA[i][1]]),
      // Growth rate: annualized ratio of consecutive samples in the refined globalDisp.
      // Sub-year refinement points around strikeDate produce a sharp dip there.
      growthSeries: (() => {
        const out = [];
        for (let i = 1; i < globalDisp.length; i++) {
          const [tPrev, vPrev] = globalDisp[i - 1];
          const [tCur,  vCur]  = globalDisp[i];
          if (vPrev <= 0 || tCur <= tPrev) continue;
          const dt = tCur - tPrev;
          const annual = Math.pow(vCur / vPrev, 1 / dt);
          out.push([tCur, annual]);
        }
        return out;
      })(),
      adjAifpAt,
    };
  }, [usNatEnabled, usNatDate, cnNatEnabled, cnNatDate, alloc, cnAlloc, usAtkSCActive, cnAtkSCActive, cnAtkStrikeDate, cnSCStrikeDate, usSCFactor, cnSCFactor, usAtkEnabled, cnAtkEnabled, usS.disabledGPUs, cnS.disabledGPUs, allyS.disabledGPUs, effUsAtkStrikeDate, effCnAtkStrikeDate]);

  // Algorithmic efficiency series (depends on halvingMonths slider)
  const algoSeries = useMemo(() => {
    const pts = [];
    for (let yr = 2024; yr <= 2035; yr += 0.1) {
      const dt = Math.max(yr - ALGO_EPOCH, 0);
      const multiplier = rate > 0 ? Math.pow(10, rate * dt) : 1;
      pts.push([yr, multiplier]);
    }
    return pts;
  }, [rate]);


  // Render the per-country milestone timeline plot to a PNG and trigger download.
  // Light-theme: white background, baseline=US-blue/CN-orange, post-strike=red dashed,
  // delay arrows + labels between matching milestones. Mirrors the matplotlib version.
  const exportMilestoneTimeline = () => {
    const W = 1600, H = 800;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const fmtDate = (y) => {
      if (!isFinite(y) || y > 2050) return ">2050";
      const yr = Math.floor(y), mo = Math.round((y - yr) * 12);
      return `${MONTHS[Math.min(mo, 11)]} ${yr}`;
    };

    // Title
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      `Milestone arrival under strike (${fmtDate(effCnAtkStrikeDate)} CN strike on US, ${fmtDate(effUsAtkStrikeDate)} US strike on CN)`,
      W / 2, 28
    );

    // Two panels side by side
    const panelW = W / 2 - 20;
    const panelH = H - 100;
    const panels = [
      { x0: 30, country: "US",    base: usS, atk: usS, strike: effCnAtkStrikeDate, color: "#3b82f6", title: "United States — capability arrival under CN strike" },
      { x0: W / 2 + 10, country: "China", base: cnS, atk: cnS, strike: effUsAtkStrikeDate, color: "#d97706", title: "China — capability arrival under US strike" },
    ];

    panels.forEach(panel => {
      const baseDates = MILESTONES.map(m => panel.base.milestoneDates?.[m.key] ?? null);
      const atkDates  = MILESTONES.map(m => panel.atk.milestoneDatesAttack?.[m.key] ?? null);

      const allDates = [...baseDates, ...atkDates].filter(d => d != null && isFinite(d));
      if (allDates.length === 0) return;
      const xMin = Math.min(...allDates) - 0.3;
      const xMax = Math.max(...allDates) + 0.3;
      const eflops = MILESTONES.map(m => Math.pow(10, m.feb2025Log10));
      const yLogMin = Math.log10(Math.min(...eflops)) - 0.4;
      const yLogMax = Math.log10(Math.max(...eflops)) + 0.4;

      const PL = panel.x0 + 70, PR = panel.x0 + panelW - 30, PT = 70, PB = H - 50;
      const xToPx = (x) => PL + (x - xMin) / (xMax - xMin) * (PR - PL);
      const yToPx = (y) => PB - (Math.log10(y) - yLogMin) / (yLogMax - yLogMin) * (PB - PT);

      // Panel border + title
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(panel.title, (PL + PR) / 2, PT - 18);

      // Y-axis log gridlines + labels at major decades
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.font = "11px system-ui";
      ctx.textAlign = "right";
      for (let exp = Math.ceil(yLogMin); exp <= Math.floor(yLogMax); exp++) {
        const py = yToPx(Math.pow(10, exp));
        ctx.beginPath();
        ctx.moveTo(PL, py); ctx.lineTo(PR, py); ctx.stroke();
        ctx.fillStyle = "#475569";
        ctx.fillText(`10^${exp}`, PL - 6, py + 4);
      }

      // X-axis year gridlines + labels
      ctx.textAlign = "center";
      for (let yr = Math.ceil(xMin); yr <= Math.floor(xMax); yr++) {
        const px = xToPx(yr);
        ctx.strokeStyle = "#e2e8f0";
        ctx.beginPath();
        ctx.moveTo(px, PT); ctx.lineTo(px, PB); ctx.stroke();
        ctx.fillStyle = "#475569";
        ctx.fillText(`${yr}`, px, PB + 16);
      }

      // Plot border
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(PL, PT, PR - PL, PB - PT);

      // Strike line (vertical dashed)
      const strikePx = xToPx(panel.strike);
      ctx.strokeStyle = "#475569";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(strikePx, PT); ctx.lineTo(strikePx, PB); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#475569";
      ctx.font = "11px system-ui";
      ctx.textAlign = "left";
      ctx.fillText("  Strike", strikePx + 3, PT + 12);

      // Baseline line + points
      ctx.strokeStyle = panel.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      baseDates.forEach((d, i) => {
        if (d == null || !isFinite(d)) return;
        const px = xToPx(d), py = yToPx(eflops[i]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      // Baseline markers
      baseDates.forEach((d, i) => {
        if (d == null || !isFinite(d)) return;
        const px = xToPx(d), py = yToPx(eflops[i]);
        ctx.fillStyle = panel.color;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
        // Milestone label (above-left)
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "right";
        ctx.fillText(MILESTONES[i].label, px - 9, py - 7);
      });

      // Post-strike line (dashed red): only segments after strike, with fork at strike-date
      const atkPathPts = [];
      // Find the y-value at the strike date by interpolating along baseline
      let strikeY = null;
      for (let i = 0; i < baseDates.length - 1; i++) {
        if (baseDates[i] != null && baseDates[i + 1] != null && baseDates[i] < panel.strike && baseDates[i + 1] >= panel.strike) {
          const f = (panel.strike - baseDates[i]) / (baseDates[i + 1] - baseDates[i]);
          strikeY = Math.pow(10, Math.log10(eflops[i]) + f * (Math.log10(eflops[i + 1]) - Math.log10(eflops[i])));
          break;
        }
      }
      if (strikeY != null) atkPathPts.push([panel.strike, strikeY]);
      atkDates.forEach((d, i) => {
        if (d == null || !isFinite(d)) return;
        if (d > panel.strike) atkPathPts.push([d, eflops[i]]);
      });
      if (atkPathPts.length >= 2) {
        ctx.strokeStyle = "#dc2626";
        ctx.setLineDash([8, 5]);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        atkPathPts.forEach(([x, y], i) => {
          const px = xToPx(x), py = yToPx(y);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Post-strike markers (squares)
      atkDates.forEach((d, i) => {
        if (d == null || !isFinite(d) || d <= panel.strike) return;
        const px = xToPx(d), py = yToPx(eflops[i]);
        ctx.fillStyle = "#dc2626";
        ctx.fillRect(px - 5, py - 5, 10, 10);
      });

      // Delay arrows + labels (horizontal)
      ctx.strokeStyle = "#475569";
      ctx.fillStyle = "#475569";
      ctx.lineWidth = 1.4;
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      baseDates.forEach((bd, i) => {
        const ad = atkDates[i];
        if (bd == null || ad == null || !isFinite(ad) || (ad - bd) <= 0.04) return;
        const py = yToPx(eflops[i]);
        const bx = xToPx(bd), ax = xToPx(ad);
        // arrow line
        ctx.beginPath();
        ctx.moveTo(bx, py); ctx.lineTo(ax, py); ctx.stroke();
        // arrowhead
        const headSize = 6;
        ctx.beginPath();
        ctx.moveTo(ax, py); ctx.lineTo(ax - headSize, py - headSize / 2); ctx.lineTo(ax - headSize, py + headSize / 2);
        ctx.closePath(); ctx.fill();
        // label
        const dly = ad - bd;
        ctx.fillText(`+${dly.toFixed(1)} yr`, (bx + ax) / 2, py - 6);
      });

      // Legend (bottom-right)
      const lx = PR - 180, ly = PB - 50;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(lx - 8, ly - 18, 175, 50);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.strokeRect(lx - 8, ly - 18, 175, 50);
      ctx.font = "11px system-ui";
      ctx.textAlign = "left";
      // Baseline legend
      ctx.strokeStyle = panel.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 4); ctx.lineTo(lx + 24, ly - 4); ctx.stroke();
      ctx.fillStyle = panel.color;
      ctx.beginPath();
      ctx.arc(lx + 12, ly - 4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1e293b";
      ctx.fillText("No-attack baseline", lx + 32, ly);
      // Attack legend
      ctx.strokeStyle = "#dc2626";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, ly + 14); ctx.lineTo(lx + 24, ly + 14); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(lx + 8, ly + 10, 8, 8);
      ctx.fillStyle = "#1e293b";
      ctx.fillText("Post-strike", lx + 32, ly + 18);

      // Y-axis label (rotated)
      ctx.save();
      ctx.translate(panel.x0 + 18, (PT + PB) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = "#475569";
      ctx.font = "12px system-ui";
      ctx.fillText("Effective FLOP at milestone (Feb-2025 reference)", 0, 0);
      ctx.restore();
    });

    // Trigger download
    const link = document.createElement("a");
    link.download = "maim-milestone-timeline.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // Export the Algorithmic Progress Rate chart to a clean white-background PNG.
  // Mirrors the in-app ProjectionChart for the rate series, but draws directly
  // to canvas (no DOM capture) for sharp print-quality output.
  const exportAlgoRateChart = () => {
    // === Compute series (parallels the IIFE that renders the on-screen chart) ===
    const sampleBackendRate = (id) => {
      const fn = remoteRateFns[id];
      if (!fn) return null;
      const isCn = id.startsWith("China-");
      const usFn = isCn && diffusion > 0 ? remoteRateFns[id.replace("China-", "US-")] : null;
      const out = [];
      for (let yr = 2024; yr <= 2040 + 1e-9; yr += 0.1) {
        let v = fn(yr);
        if (usFn) {
          const usR = Math.max(0, usFn(yr) || 0);
          const cnR = Math.max(0, v || 0);
          v = Math.max(cnR, (1 - diffusion) * cnR + diffusion * usR);
        }
        if (Number.isFinite(v)) out.push([yr, v]);
      }
      return out;
    };
    const useBackend = useAifpBackend && backendStatus === "connected";
    const fallback = (series) => (series || []).filter(d => d && d[1] > 0).map(d => [d[0], Math.log10(d[1])]);
    const anyStrike = usAtkEnabled || cnAtkEnabled;
    const usBase = (useBackend && sampleBackendRate("US-baseline")) || fallback(usS?.baselineRateSeries);
    const cnBase = MODEL_CHINA ? ((useBackend && sampleBackendRate("China-baseline")) || fallback(cnS?.baselineRateSeries)) : [];
    const usAtk = anyStrike ? ((useBackend && sampleBackendRate("US-attack")) || fallback(usS?.attackRateSeries)) : [];
    const cnAtk = anyStrike && MODEL_CHINA ? ((useBackend && sampleBackendRate("China-attack")) || fallback(cnS?.attackRateSeries)) : [];
    const all = [...usBase, ...cnBase, ...usAtk, ...cnAtk].filter(d => d[0] <= 2040);
    if (all.length === 0) return;
    const yMax = Math.max(2, Math.ceil(Math.max(...all.map(d => d[1]), 1) * 1.1));
    const niceStep = yMax <= 2 ? 0.25 : yMax <= 4 ? 0.5 : yMax <= 8 ? 1 : 2;

    const series = [
      { data: usBase, color: "#3b82f6", label: "US baseline", dashed: false },
      ...(MODEL_CHINA ? [{ data: cnBase, color: "#d97706", label: "CN baseline", dashed: false }] : []),
      ...(anyStrike ? [{ data: usAtk, color: "#3b82f6", label: "US post-attack", dashed: true }] : []),
      ...(anyStrike && MODEL_CHINA ? [{ data: cnAtk, color: "#d97706", label: "CN post-attack", dashed: true }] : []),
    ];

    // === Render to canvas ===
    const W = 1400, H = 760;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Title + subtitle
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Algorithmic Progress Rate", W / 2, 36);
    ctx.font = "13px system-ui";
    ctx.fillStyle = "#475569";
    ctx.fillText(
      useBackend ? "Software-efficiency rate (OOM/yr at each month) — AIFP backend"
                 : "Yearly software-efficiency growth rate (local model, OOM/yr)",
      W / 2, 60
    );

    // Plot area
    const PL = 90, PR = W - 60, PT = 100, PB = H - 90;
    const xMin = 2024, xMax = 2040;
    const xToPx = (x) => PL + (x - xMin) / (xMax - xMin) * (PR - PL);
    const yToPx = (y) => PB - (y / yMax) * (PB - PT);

    // Y gridlines + labels
    ctx.font = "12px system-ui";
    ctx.fillStyle = "#475569";
    for (let v = 0; v <= yMax + 1e-9; v += niceStep) {
      const py = yToPx(v);
      ctx.strokeStyle = v === 0 ? "#94a3b8" : "#e2e8f0";
      ctx.lineWidth = v === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(PL, py); ctx.lineTo(PR, py); ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillStyle = "#475569";
      ctx.fillText(v.toFixed(niceStep < 1 ? 2 : 1), PL - 8, py + 4);
    }

    // X gridlines + labels
    ctx.textAlign = "center";
    for (let yr = 2024; yr <= 2040; yr += 2) {
      const px = xToPx(yr);
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, PT); ctx.lineTo(px, PB); ctx.stroke();
      ctx.fillStyle = "#475569";
      ctx.fillText(String(yr), px, PB + 22);
    }

    // Axes border
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(PL, PT, PR - PL, PB - PT);

    // NOW line
    const nowPx = xToPx(NOW);
    if (nowPx >= PL && nowPx <= PR) {
      ctx.strokeStyle = "#94a3b8";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(nowPx, PT); ctx.lineTo(nowPx, PB); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(" Now", nowPx + 2, PT + 14);
    }

    // Strike vertical lines
    const strikeLines = [
      ...(cnAtkEnabled ? [{ date: cnAtkStrikeDate, color: "#d97706", label: "CN→US strike" }] : []),
      ...(usAtkEnabled ? [{ date: usAtkStrikeDate, color: "#3b82f6", label: "US→CN strike" }] : []),
    ];
    strikeLines.forEach((sl, i) => {
      const px = xToPx(sl.date);
      if (px < PL || px > PR) return;
      ctx.strokeStyle = sl.color;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, PT); ctx.lineTo(px, PB); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = sl.color;
      ctx.font = "11px system-ui";
      ctx.textAlign = "left";
      ctx.fillText(" " + sl.label, px + 2, PT + 28 + i * 14);
    });

    // Plot each series
    series.forEach(s => {
      if (!s.data || s.data.length === 0) return;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      if (s.dashed) ctx.setLineDash([6, 4]); else ctx.setLineDash([]);
      ctx.beginPath();
      let started = false;
      for (const [x, y] of s.data) {
        if (x < xMin || x > xMax) continue;
        const px = xToPx(x), py = yToPx(Math.max(0, Math.min(yMax, y)));
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Legend (top-right)
    const legendX = PR - 220, legendY = PT + 14;
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    series.forEach((s, i) => {
      const ly = legendY + i * 20;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      if (s.dashed) ctx.setLineDash([6, 4]); else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(legendX, ly); ctx.lineTo(legendX + 30, ly); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#1e293b";
      ctx.fillText(s.label, legendX + 38, ly + 4);
    });

    // X axis label
    ctx.fillStyle = "#475569";
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Year", (PL + PR) / 2, H - 35);

    // Y axis label
    ctx.save();
    ctx.translate(28, (PT + PB) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("OOM / year", 0, 0);
    ctx.restore();

    // Trigger download
    const link = document.createElement("a");
    link.download = "maim-algo-progress-rate.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const exportPNG = async (elementId, filename) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    // Load html2canvas from CDN if not already loaded
    if (!window.html2canvas) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    // html2canvas can't render <input type="range">, so temporarily replace them with visual divs
    const rangeInputs = el.querySelectorAll('input[type="range"]');
    const replacements = [];
    rangeInputs.forEach(input => {
      const rect = input.getBoundingClientRect();
      const min = parseFloat(input.min), max = parseFloat(input.max), val = parseFloat(input.value);
      const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
      const color = input.style.getPropertyValue("--thumb") || getComputedStyle(input).accentColor || "#6366f1";
      const fake = document.createElement("div");
      fake.style.cssText = `position:relative;width:${rect.width}px;height:20px;display:flex;align-items:center;`;
      fake.innerHTML = `<div style="width:100%;height:4px;background:#1e293b;border-radius:2px;position:relative;">
        <div style="position:absolute;left:${pct}%;top:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:${color};"></div>
      </div>`;
      input.style.display = "none";
      input.parentNode.insertBefore(fake, input.nextSibling);
      replacements.push({ input, fake });
    });
    const canvas = await window.html2canvas(el, {
      backgroundColor: "#0a0f1a",
      scale: 2,
      useCORS: true,
    });
    // Restore original range inputs
    replacements.forEach(({ input, fake }) => {
      input.style.display = "";
      fake.remove();
    });
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const fmtDate = y => {
    if(y===Infinity||y>2050) return ">2050";
    const yr=Math.floor(y), mo=Math.round((y-yr)*12)+1;
    const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${M[Math.min(mo-1,11)]} ${yr}`;
  };
  const fmtDur = y => {
    if(y===Infinity) return ">2050";
    if(y<1/12) return `${(y*365).toFixed(0)} days`;
    if(y<1) return `${(y*12).toFixed(1)} months`;
    return `${y.toFixed(1)} years`;
  };

  return (
    <div style={{"--f":"'IBM Plex Mono','SF Mono','Fira Code',monospace",minHeight:"100vh",background:"#0a0f1a",color:"#e2e8f0",fontFamily:"var(--f)",padding:"24px 20px"}}>
      <div style={{ maxWidth:1100, margin:"0 auto" }}>
        <div style={{ marginBottom:6 }}>
          <span style={{ fontSize:11, letterSpacing:3, color:"#ef4444", textTransform:"uppercase", fontWeight:600 }}>Compute Vulnerability Analysis</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div>
            <h1 style={{ fontSize:26, fontWeight:300, margin:"0 0 4px 0", color:"#f8fafc", letterSpacing:-0.5 }}>MAIM Targeting Model</h1>
            <p style={{ fontSize:13, color:"#475569", margin:0, maxWidth:720, lineHeight:1.5 }}>
              If a state actor struck their rival{"'"}s datacenters, how long would it be until a country could
              complete a frontier training run? The chart shows every known cluster
              ({"\u2265"}1K H100-eq) across US, China, allies, and rest of world. Connected dots are
              phases of the same physical site. Data from merged Epoch AI and Frontier DC Timelines datasets.
            </p>
          </div>
          <div style={{ display:"flex", gap:6, flexShrink:0, flexWrap:"wrap" }}>
            <button onClick={() => exportPNG("export-dashboard", "maim-dashboard.png")}
              style={{ fontSize:10, padding:"5px 10px", background:"#1e293b", color:"#94a3b8", border:"1px solid #334155", borderRadius:4, cursor:"pointer", fontFamily:"var(--f)" }}>
              Export Inputs
            </button>
            <button onClick={() => exportPNG("export-visuals", "maim-scatter-timeline.png")}
              style={{ fontSize:10, padding:"5px 10px", background:"#1e293b", color:"#94a3b8", border:"1px solid #334155", borderRadius:4, cursor:"pointer", fontFamily:"var(--f)" }}>
              Export Scatter + Timeline
            </button>
            <button onClick={() => exportMilestoneTimeline()}
              style={{ fontSize:10, padding:"5px 10px", background:"#ffffff", color:"#1e293b", border:"1px solid #cbd5e1", borderRadius:4, cursor:"pointer", fontFamily:"var(--f)", fontWeight:600 }}>
              Export Milestone Timeline
            </button>
            <button onClick={() => exportAlgoRateChart()}
              style={{ fontSize:10, padding:"5px 10px", background:"#ffffff", color:"#1e293b", border:"1px solid #cbd5e1", borderRadius:4, cursor:"pointer", fontFamily:"var(--f)", fontWeight:600 }}>
              Export Algo Progress Rate
            </button>
          </div>
        </div>

        <div id="export-dashboard">
        <div style={{ background:"rgba(15,23,42,0.8)", border:"1px solid #1e293b", borderRadius:8, padding:"16px 18px", marginBottom:20 }}>
          {/* Shared controls: F_eff and algo halving */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:20, marginBottom:16 }}>
            <div style={{ flex:1, minWidth:260 }}>
              <div style={{ fontSize:11, color:"#94a3b8", fontFamily:"var(--f)", fontWeight:600, marginBottom:6 }}>
                Capability to deter (effective FLOP)
                <span style={{ fontWeight:400, color:"#475569", marginLeft:6, fontSize:10 }}>F_eff, normalized to March 2026 algorithms</span>
              </div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:4 }}>
                {MILESTONES.map(m => {
                  const internalExp = feb2025ToInternalExp(m.feb2025Log10);
                  const active = !customFlop && Math.abs(flopExp - internalExp) < 0.05;
                  const feb2025Str = `${(Math.pow(10, m.feb2025Log10 - Math.floor(m.feb2025Log10))).toFixed(0)}e${Math.floor(m.feb2025Log10)}`;
                  return (
                    <Btn key={m.key} active={active} onClick={() => { setFlopExp(internalExp); setCustomFlop(false); }}>
                      {m.label} {feb2025Str}
                    </Btn>
                  );
                })}
                <Btn active={customFlop} onClick={()=>setCustomFlop(!customFlop)}>Custom</Btn>
              </div>
              <div style={{ fontSize:10, color:"#475569", fontFamily:"var(--f)", marginTop:-2, marginBottom:6 }}>
                Stated in Feb-2025 eFLOP. Internally shifted {FLOP_EPOCH_SHIFT.toFixed(2)} OOM to March-2026 reference.
              </div>
              {/* Scoreboard: US/CN baseline (no-strike) training-run completion dates.
                  FLOP budgets are user-specified (MILESTONES), read off AIFP's chart at
                  each milestone date. The algo_multiplier(t) curve used in the training-run
                  search comes from AIFP's Python backend (full dynamics including automation
                  feedback). */}
              <div style={{ marginTop:6, marginBottom:8, padding:"8px 10px", background:"rgba(15,23,42,0.6)", border:"1px solid #1e293b", borderRadius:6 }}>
                <div style={{ fontSize:10, color:"#94a3b8", fontFamily:"var(--f)", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>
                  Training-run completion: baseline vs post-strike
                </div>
                <table style={{ width:"100%", fontSize:11, fontFamily:"var(--f)", borderCollapse:"collapse" }}>
                  <thead>
                    <tr style={{ color:"#64748b" }}>
                      <th style={{ textAlign:"left", paddingBottom:2 }}>Milestone</th>
                      <th style={{ textAlign:"right", color:"#93c5fd", paddingBottom:2 }}>US baseline</th>
                      <th style={{ textAlign:"right", color:"#f87171", paddingBottom:2 }}>US post-strike</th>
                      {MODEL_CHINA && <th style={{ textAlign:"right", color:"#fde68a", paddingBottom:2 }}>CN baseline</th>}
                      {MODEL_CHINA && <th style={{ textAlign:"right", color:"#f87171", paddingBottom:2 }}>CN post-strike</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {MILESTONES.map(m => {
                      const us = usS?.milestoneDates?.[m.key];
                      const usAtk = usS?.milestoneDatesAttack?.[m.key];
                      const cn = cnS?.milestoneDates?.[m.key];
                      const cnAtk = cnS?.milestoneDatesAttack?.[m.key];
                      const _MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                      const fmt = (d) => {
                        if (d == null || !isFinite(d)) return "—";
                        const y = Math.floor(d);
                        const m = Math.min(11, Math.max(0, Math.round((d - y) * 12)));
                        return `${_MONTHS[m]} ${y}`;
                      };
                      return (
                        <tr key={m.key}>
                          <td style={{ color:"#cbd5e1", padding:"1px 0" }}>
                            <span style={{ color:"#e2e8f0", fontWeight:600 }}>{m.label}</span>
                            <span style={{ color:"#475569", marginLeft:6, fontSize:10 }}>{m.hint}</span>
                          </td>
                          <td style={{ textAlign:"right", color:"#60a5fa", fontVariantNumeric:"tabular-nums" }}>{fmt(us)}</td>
                          <td style={{ textAlign:"right", color: (usAtk != null && us != null && usAtk > us + 0.01) ? "#f87171" : "#64748b", fontVariantNumeric:"tabular-nums" }}>{fmt(usAtk)}</td>
                          {MODEL_CHINA && <td style={{ textAlign:"right", color:"#fbbf24", fontVariantNumeric:"tabular-nums" }}>{fmt(cn)}</td>}
                          {MODEL_CHINA && <td style={{ textAlign:"right", color: (cnAtk != null && cn != null && cnAtk > cn + 0.01) ? "#f87171" : "#64748b", fontVariantNumeric:"tabular-nums" }}>{fmt(cnAtk)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {customFlop && (
                <Slider label=""
                  hint="The FLOP budget defining the target capability milestone. Normalized to March 2026 algorithmic efficiency."
                  value={flopExp} onChange={setFlopExp}
                  min={24} max={35} step={0.1} format={v=>`10^${v.toFixed(1)} FLOP`} />
              )}
              {!customFlop && (
                <div style={{ fontSize:10, color:"#475569", fontFamily:"var(--f)", marginTop:2 }}>
                  Current: 10^{flopExp.toFixed(1)} FLOP
                </div>
              )}
            </div>
            <div style={{ flex:1, minWidth:260 }}>
              {/* Advanced overrides dropdown (AIFP backend is always on by default). */}
              {useAifpBackend && (
                <div style={{ marginBottom:10, display:"flex", justifyContent:"flex-end" }}>
                  <button
                    onClick={() => setShowAifpOverrides(v => !v)}
                    style={{ fontSize:11, fontFamily:"var(--f)", padding:"4px 10px", background:"rgba(30,41,59,0.6)", color:"#a78bfa", border:"1px solid #4c1d9544", borderRadius:4, cursor:"pointer" }}
                  >
                    {showAifpOverrides ? "\u25BC hide model variables" : "\u25B6 model variables"}
                  </button>
                </div>
              )}
              {useAifpBackend && showAifpOverrides && (
                <div style={{ marginBottom:10, padding:"8px 10px", background:"rgba(15,23,42,0.5)", border:"1px dashed #334155", borderRadius:6 }}>
                  <div style={{ fontSize:10, color:"#94a3b8", fontFamily:"var(--f)", marginBottom:6, lineHeight:1.4 }}>
                    Override key AI Futures Algorithmic forecast parameters on top of the preset. Leave blank to inherit.
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:8 }}>
                    {[
                      { label: "present_doubling_time", hint: "yr; default 0.458 / eli 0.373 / daniel 0.373", value: ovPresentDoublingTime, setter: setOvPresentDoublingTime, ph: "0.458" },
                      { label: "doubling_difficulty_growth_factor", hint: "\u22651; default 1.0 flat, >1 diminishing", value: ovDoublingDifficulty, setter: setOvDoublingDifficulty, ph: "1.0" },
                      { label: "software_progress_rate_at_reference_year", hint: "OOM/yr at 2025; default 1.0. The true sw-rate knob (r_software is internally calibrated)", value: ovSwProgressRate, setter: setOvSwProgressRate, ph: "1.0" },
                      { label: "ai_research_taste_slope", hint: "taste/OOM; default 2.1 / daniel 3.0", value: ovTasteSlope, setter: setOvTasteSlope, ph: "2.1" },
                      { label: "ac_time_horizon_minutes", hint: "AC threshold in work-minutes; default 1.5e7 (125 wk-yr) / daniel 1.25e5 (1 wk-yr)", value: ovAcHorizon, setter: setOvAcHorizon, ph: "15000000" },
                    ].map(o => (
                      <label key={o.label} style={{ display:"flex", flexDirection:"column", gap:2 }}>
                        <span style={{ fontSize:10, color:"#cbd5e1", fontFamily:"var(--f)", fontWeight:600 }}>{o.label}</span>
                        <input
                          type="text"
                          value={o.value}
                          onChange={e => o.setter(e.target.value)}
                          placeholder={o.ph}
                          style={{ background:"#0f172a", color:"#e2e8f0", border:"1px solid #334155", borderRadius:3, padding:"3px 6px", fontSize:11, fontFamily:"var(--f)" }}
                        />
                        <span style={{ fontSize:9, color:"#64748b", fontFamily:"var(--f)" }}>{o.hint}</span>
                      </label>
                    ))}
                  </div>
                  {/* CN algo diffusion (κ) lives in the model-variables menu */}
                  <div style={{ marginTop:12, paddingTop:10, borderTop:"1px dashed #334155" }}>
                    <Slider label="CN algo diffusion from US" hint="Fraction of gap between China's compute-derived algo rate and US baseline rate closed by free-riding on US research. 0 = independent, 1 = matches US."
                      value={diffusion} onChange={setDiffusion} min={0} max={1} step={0.05} format={v=>(v*100).toFixed(0)+"%"} />
                  </div>
                  <div style={{ marginTop:10, paddingTop:10, borderTop:"1px dashed #334155" }}>
                    <label style={{ fontSize:10, color: dynamicThresholdDenial ? "#a78bfa" : "#64748b", fontFamily:"var(--f)", display:"flex", alignItems:"center", gap:5, cursor:"pointer", marginBottom:3 }}>
                      <input type="checkbox" checked={dynamicThresholdDenial} onChange={e=>setDynamicThresholdDenial(e.target.checked)}
                        style={{ accentColor:"#a78bfa", width:11, height:11, cursor:"pointer" }} />
                      Dynamic-threshold continuous denial (prototype)
                    </label>
                    <div style={{ fontSize:9, color:"#475569", fontFamily:"var(--f)", paddingLeft:16, lineHeight:1.3 }}>
                      {dynamicThresholdDenial
                        ? "Threshold recomputed each month to keep destroying the strike's % of NEW compute (rises as compute concentrates)."
                        : "Off: fixed-H100e threshold set at strike date. On: percent-of-new-compute threshold that adjusts monthly."}
                    </div>
                  </div>
                </div>
              )}
              {useAifpBackend && (() => {
                const isStale = backendStatus !== "loading" && lastFetchedKey !== "" && scenarioKey !== lastFetchedKey;
                const isLoading = backendStatus === "loading";
                return (
                  <div style={{ marginBottom:12 }}>
                    <button
                      onClick={() => setRunVersion(v => v + 1)}
                      disabled={isLoading}
                      style={{
                        display:"block", width:"100%",
                        fontSize:16, fontFamily:"var(--f)", fontWeight:700,
                        padding:"14px 24px",
                        background: isLoading ? "#475569" : isStale ? "#fbbf24" : "#3b82f6",
                        color: isStale && !isLoading ? "#0f172a" : "#f8fafc",
                        border: isStale ? "2px solid #f59e0b" : "2px solid transparent",
                        borderRadius:6,
                        cursor: isLoading ? "wait" : "pointer",
                        opacity: isLoading ? 0.8 : 1,
                        letterSpacing:0.3,
                        boxShadow: isStale && !isLoading ? "0 0 0 3px rgba(251,191,36,0.25)" : "none",
                        transition:"background 120ms, box-shadow 120ms",
                      }}
                    >
                      {isLoading ? "Running\u2026" : isStale ? "\u25B6 Run model (changes pending)" : "\u25B6 Run model"}
                    </button>
                    {/* Loading bar fills asymptotically toward 95% during the request,
                        then snaps to 100% on completion and fades. */}
                    <LoadingBar isLoading={isLoading} />
                    <div style={{
                      marginTop: 10,
                      fontSize: 11,
                      color: "#94a3b8",
                      fontFamily: "var(--f)",
                      lineHeight: 1.55,
                    }}>
                      {typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" && (
                        <div style={{ fontStyle: "italic", color: "#64748b", marginBottom: 6 }}>
                          (First request may take ~30 seconds while the backend wakes up.)
                        </div>
                      )}
                      <div style={{ fontWeight: 600, color: "#cbd5e1", marginBottom: 4 }}>Instructions:</div>
                      <ol style={{ margin: 0, paddingLeft: 18 }}>
                        <li>Set target strike dates, strategies, and sabotage threshold.</li>
                        <li>Select capability threshold to deter.</li>
                        <li>Refresh model manually above for updated results.</li>
                      </ol>
                    </div>
                  </div>
                );
              })()}
              {!useAifpBackend && (<>
              <Slider label="Baseline algorithmic efficiency halving time"
                hint="(Legacy MAIM knob). Months before algorithmic progress halves the required compute. Compounds from March 2026."
                value={halvingMonths} onChange={setHalvingMonths}
                min={3} max={12} step={0.5}
                format={v=>`${v} months`} />
              <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:-4 }}>
                <Btn active={halvingMonths===6} onClick={()=>setHalvingMonths(6)}>4x/yr (6mo)</Btn>
                <Btn active={halvingMonths===7.5} onClick={()=>setHalvingMonths(7.5)}>3x/yr (7.5mo)</Btn>
                <Btn active={halvingMonths===9} onClick={()=>setHalvingMonths(9)}>2.5x/yr (9mo)</Btn>
                <Btn active={halvingMonths===12} onClick={()=>setHalvingMonths(12)}>2x/yr (12mo)</Btn>
              </div>
              </>)}
              {!useAifpBackend && halvingMonths < 120 &&<div style={{ fontSize:11, color:"#2dd4bf", fontFamily:"var(--f)", marginTop:6, display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:"#2dd4bf", display:"inline-block", opacity:0.7 }}/>
                {`US baseline: ${rate.toFixed(2)} OOM/yr present-day (\u03B5=0.34, saturating at 1000\u00D7)`}
              </div>}
            </div>
          </div>

          {/* Parameter sweep panel — runs window.__sweep + opens window.__plotSweep */}
          <div style={{ marginBottom:16, background:"rgba(15,23,42,0.5)", border:"1px solid #1e293b", borderRadius:8, padding:"10px 14px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }} onClick={() => setSweepOpen(o => !o)}>
              <div style={{ fontSize:13, fontWeight:600, color:"#94a3b8", fontFamily:"var(--f)" }}>
                {sweepOpen ? "▼" : "▶"} Parameter sweep
              </div>
              {sweepStatus && <div style={{ fontSize:11, color:"#94a3b8", fontFamily:"var(--f)" }}>{sweepStatus}</div>}
            </div>
            {sweepOpen && (
              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:10, color:"#64748b", fontFamily:"var(--f)", marginBottom:6, lineHeight:1.4 }}>
                  Edit the config JSON below, then click <b>Run + Plot</b>. Strings like <code>monthly(2026.5, 2031.5)</code>, <code>linspace(0, 100, 11)</code>, or <code>range(0, 5, 0.25)</code> expand to arrays via <code>window.__sweepRange</code>. Recognised vary axes: any <code>cnAtk*</code> / <code>usAtk*</code> state knob, <code>tsmcDestroyed</code>, <code>usStrikeCnFabs</code>, nationalization toggles/dates. See <code>SWEEP_USAGE.md</code>.
                </div>
                <textarea
                  value={sweepConfigText}
                  onChange={e => setSweepConfigText(e.target.value)}
                  spellCheck={false}
                  style={{ width:"100%", minHeight:240, fontFamily:"ui-monospace,Consolas,monospace", fontSize:11, padding:8, background:"#0b1220", color:"#cbd5e1", border:"1px solid #1e293b", borderRadius:4, lineHeight:1.4 }}
                />
                <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:8 }}>
                  <button
                    disabled={sweepRunning}
                    onClick={async () => {
                      let parsed;
                      try { parsed = JSON.parse(sweepConfigText); } catch (e) { setSweepStatus("parse error: " + e.message); return; }
                      // Expand string range expressions
                      const expand = (val) => {
                        if (typeof val !== 'string') return val;
                        const m = val.match(/^(monthly|linspace|range)\(([-\d.,\s]+)\)$/);
                        if (!m || !window.__sweepRange?.[m[1]]) return val;
                        const args = m[2].split(',').map(s => parseFloat(s.trim()));
                        return window.__sweepRange[m[1]](...args);
                      };
                      if (parsed.vary) for (const k of Object.keys(parsed.vary)) parsed.vary[k] = expand(parsed.vary[k]);
                      const plotOpts = parsed.plot;
                      delete parsed.plot;
                      setSweepRunning(true);
                      setSweepStatus("starting…");
                      const t0 = Date.now();
                      const poll = setInterval(() => {
                        const pg = window.__sweepProgress;
                        if (pg) setSweepStatus(`${pg.phase} ${pg.done}/${pg.total}`);
                      }, 500);
                      sweepProgressRef.current = poll;
                      try {
                        const r = await window.__sweep(parsed);
                        clearInterval(poll);
                        const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
                        setSweepStatus(`done — ${r.probes.length} probes in ${elapsedSec}s`);
                        window.__plotSweep(r, plotOpts || {});
                      } catch (e) {
                        clearInterval(poll);
                        setSweepStatus("error: " + (e.message || e));
                      } finally {
                        setSweepRunning(false);
                      }
                    }}
                    style={{ background: sweepRunning ? "#475569" : "#3b82f6", color:"#f8fafc", border:"none", padding:"8px 16px", borderRadius:4, fontWeight:600, cursor: sweepRunning ? "wait" : "pointer", fontSize:12, fontFamily:"var(--f)" }}
                  >{sweepRunning ? "Running…" : "▶ Run sweep + plot"}</button>
                  <button
                    disabled={!window.__sweepResult}
                    onClick={() => {
                      if (!window.__sweepResult) return;
                      const blob = new Blob([JSON.stringify(window.__sweepResult)], { type: 'application/json' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = 'sweep_' + Date.now() + '.json';
                      document.body.appendChild(a); a.click();
                    }}
                    style={{ background:"#334155", color:"#cbd5e1", border:"1px solid #475569", padding:"8px 12px", borderRadius:4, fontSize:11, fontFamily:"var(--f)", cursor:"pointer" }}
                  >Download JSON</button>
                  <button
                    disabled={!window.__sweepResult}
                    onClick={() => { if (window.__sweepResult) window.__plotSweep(window.__sweepResult, {}); }}
                    style={{ background:"#334155", color:"#cbd5e1", border:"1px solid #475569", padding:"8px 12px", borderRadius:4, fontSize:11, fontFamily:"var(--f)", cursor:"pointer" }}
                  >Re-plot last</button>
                </div>
              </div>
            )}
          </div>

          {/* Attack panels (China-strikes-US only when MODEL_CHINA=false) */}
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            {[
              ...(MODEL_CHINA ? [{ label: "US strikes China", color: "#3b82f6", borderColor: "#3b82f622",
                enabled: usAtkEnabled, setEnabled: setUsAtkEnabled,
                threshold: usAtkThreshold, setThreshold: setUsAtkThreshold,
                pctMode: usAtkPctMode, setPctMode: setUsAtkPctMode,
                pctDestroyed: usAtkPctDestroyed, setPctDestroyed: setUsAtkPctDestroyed,
                effThreshold: effUsAtkThreshold,
                sd: usAtkStrikeDate, setSd: setUsAtkStrikeDate,
                preempt: usAtkPreempt, setPreempt: setUsAtkPreempt,
                denialYears: usAtkDenialYears, setDenialYears: setUsAtkDenialYears,
                nat: { label: "CN Nationalization", enabled: cnNatEnabled, setEnabled: setCnNatEnabled, date: cnNatDate, setDate: setCnNatDate, color: "#d97706" },
                scToggles: [
                  { label: "Strikes on SMIC and CXMT", checked: usStrikeCnFabs, set: setUsStrikeCnFabs, extra: `(+${Math.round(4 + Math.max(0, usAtkStrikeDate - 2026) / 2)} fabs)`,
                    hint: "Destroy SMIC and CXMT fabs in China. China loses ~46% of new builds permanently \u2014 ASML and Zeiss SMT bottlenecks make rebuilding equivalent capacity infeasible on the modeled time horizon." },
                ],
              }] : []),
              { label: "China strikes US", color: "#d97706", borderColor: "#d9770622",
                enabled: cnAtkEnabled, setEnabled: setCnAtkEnabled,
                threshold: cnAtkThreshold, setThreshold: setCnAtkThreshold,
                pctMode: cnAtkPctMode, setPctMode: setCnAtkPctMode,
                pctDestroyed: cnAtkPctDestroyed, setPctDestroyed: setCnAtkPctDestroyed,
                effThreshold: effCnAtkThreshold,
                sd: cnAtkStrikeDate, setSd: setCnAtkStrikeDate,
                preempt: cnAtkPreempt, setPreempt: setCnAtkPreempt,
                denialYears: cnAtkDenialYears, setDenialYears: setCnAtkDenialYears,
                nat: { label: "US Nationalization", enabled: usNatEnabled, setEnabled: setUsNatEnabled, date: usNatDate, setDate: setUsNatDate, color: "#3b82f6" },
                scToggles: [
                  { label: "Strikes on TSMC Taiwan and Arizona", checked: tsmcDestroyed, set: setTsmcDestroyed, extra: `(+${Math.round(8 + Math.max(0, cnAtkStrikeDate - 2026) / 2)} fabs)`,
                    hint: "Destroy TSMC fabs in Taiwan + Arizona. US loses ~95% of new builds permanently — ASML's ~60-scanner/yr EUV output and Zeiss SMT's single-source optics bottleneck rebuild capacity to a decade-plus horizon. China loses ~49% (blowback: smuggling and offshore remote-access compute both depend on TSMC chip flow)." },
                ],
              },
            ].map(atk => (
              <div key={atk.label} style={{ flex:"1 1 280px", background:"rgba(15,23,42,0.5)", border:`1px solid ${atk.borderColor}`, borderRadius:6, padding:"12px 14px" }}>
                <label style={{ fontSize:12, color: atk.enabled ? atk.color : "#64748b", fontFamily:"var(--f)", fontWeight:600, display:"flex", alignItems:"center", gap:6, cursor:"pointer", marginBottom:10 }}>
                  <input type="checkbox" checked={atk.enabled} onChange={e=>atk.setEnabled(e.target.checked)}
                    style={{ accentColor: atk.color, width:14, height:14, cursor:"pointer" }} />
                  {atk.label}
                </label>
                <div style={{ opacity: atk.enabled ? 1 : 0.3, pointerEvents: atk.enabled ? "auto" : "none" }}>
                  <label style={{ fontSize:10, color:"#94a3b8", fontFamily:"var(--f)", display:"flex", alignItems:"center", gap:6, cursor:"pointer", marginBottom:6, textTransform:"uppercase", letterSpacing:0.5 }}>
                    <input type="checkbox" checked={atk.pctMode} onChange={e=>atk.setPctMode(e.target.checked)}
                      style={{ accentColor: atk.color, width:12, height:12, cursor:"pointer" }} />
                    Set by % of compute destroyed at strike
                  </label>
                  {atk.pctMode ? (
                    <>
                      <Slider label="National compute destroyed at strike"
                        hint="Picks the cluster-size threshold that destroys this fraction of the defender's existing-at-strike compute. Mapped via the bucket model."
                        value={atk.pctDestroyed} onChange={atk.setPctDestroyed}
                        min={0} max={100} step={1} format={v=>`${v}% (≈ ${F(atk.effThreshold)} threshold)`} />
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:-4, marginBottom:8 }}>
                        <Btn active={atk.pctDestroyed===0} onClick={()=>atk.setPctDestroyed(0)}>0%</Btn>
                        <Btn active={atk.pctDestroyed===10} onClick={()=>atk.setPctDestroyed(10)}>10%</Btn>
                        <Btn active={atk.pctDestroyed===25} onClick={()=>atk.setPctDestroyed(25)}>25%</Btn>
                        <Btn active={atk.pctDestroyed===50} onClick={()=>atk.setPctDestroyed(50)}>50%</Btn>
                        <Btn active={atk.pctDestroyed===75} onClick={()=>atk.setPctDestroyed(75)}>75%</Btn>
                        <Btn active={atk.pctDestroyed===90} onClick={()=>atk.setPctDestroyed(90)}>90%</Btn>
                        <Btn active={atk.pctDestroyed===99} onClick={()=>atk.setPctDestroyed(99)}>99%</Btn>
                      </div>
                    </>
                  ) : (
                    <>
                      <Slider label="Sabotage threshold (H100-equivalents)"
                        hint="Clusters at or above this size (in H100e) are targeted."
                        value={atk.threshold>=1e11?100000000:atk.threshold} onChange={atk.setThreshold}
                        min={10000} max={100000000} step={10000} logScale format={v=>atk.threshold>=1e11?"OFF":F(v)} />
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:-4, marginBottom:8 }}>
                        <Btn active={atk.threshold>=1e11} onClick={()=>atk.setThreshold(1e11)}>None</Btn>
                        <Btn active={atk.threshold===10000} onClick={()=>atk.setThreshold(10000)}>10K</Btn>
                        <Btn active={atk.threshold===50000} onClick={()=>atk.setThreshold(50000)}>50K</Btn>
                        <Btn active={atk.threshold===100000} onClick={()=>atk.setThreshold(100000)}>100K</Btn>
                        <Btn active={atk.threshold===500000} onClick={()=>atk.setThreshold(500000)}>500K</Btn>
                        <Btn active={atk.threshold===1000000} onClick={()=>atk.setThreshold(1000000)}>1M</Btn>
                        <Btn active={atk.threshold===5000000} onClick={()=>atk.setThreshold(5000000)}>5M</Btn>
                      </div>
                    </>
                  )}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:3 }}>
                    <span style={{ fontSize:10, color:"#94a3b8", fontFamily:"var(--f)", textTransform:"uppercase", letterSpacing:0.5 }}>Strike date</span>
                    <span style={{ fontSize:13, color:"#e2e8f0", fontFamily:"var(--f)", fontWeight:600 }}>{fmtDate(atk.sd)}</span>
                  </div>
                  <input type="range" min={2026.25} max={2040} step={1/12} value={atk.sd}
                    onChange={e => atk.setSd(parseFloat(e.target.value))}
                    style={{ width:"100%", accentColor: atk.color }} />
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:"#475569", fontFamily:"var(--f)", marginTop:1, marginBottom:8 }}>
                    <span>2026</span><span>2030</span><span>2034</span><span>2038</span><span>2040</span>
                  </div>
                  <label style={{ fontSize:10, color: atk.preempt ? "#a78bfa" : "#64748b", fontFamily:"var(--f)", textTransform:"uppercase", letterSpacing:0.5, display:"flex", alignItems:"center", gap:5, cursor:"pointer", marginBottom:2 }}>
                    <input type="checkbox" checked={atk.preempt} onChange={e=>atk.setPreempt(e.target.checked)}
                      style={{ accentColor:"#a78bfa", width:11, height:11, cursor:"pointer" }} />
                    Continuous denial
                  </label>
                  <div style={{ fontSize:9, color:"#475569", fontFamily:"var(--f)", marginBottom:6, paddingLeft:16, lineHeight:1.3 }}>
                    {atk.preempt ? (
                      !isFinite(atk.denialYears)
                        ? "Above-threshold builds prevented indefinitely (legacy preempt-forever semantics)."
                        : `Above-threshold builds prevented for ${atk.denialYears < 1 ? `${Math.round(atk.denialYears*12)} months` : `${atk.denialYears} year${atk.denialYears===1?"":"s"}`} after strike, then normal building resumes.`
                    ) : "Strike once only: existing clusters destroyed, but future builds proceed."}
                  </div>
                  {atk.preempt && (
                    <div style={{ display:"flex", gap:4, marginBottom:8, paddingLeft:16 }}>
                      {[0.5, 1, 2, 5].map(y => (
                        <Btn
                          key={String(y)}
                          active={isFinite(y) ? Math.abs(atk.denialYears - y) < 0.01 : !isFinite(atk.denialYears)}
                          onClick={() => atk.setDenialYears(y)}
                        >
                          {!isFinite(y) ? "∞" : y < 1 ? `${Math.round(y*12)}mo` : `${y}y`}
                        </Btn>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop:6 }}>
                    <div style={{ fontSize:10, letterSpacing:0.5, color:"#f97316", textTransform:"uppercase", fontFamily:"var(--f)", marginBottom:4 }}>Supply Chain Disruption</div>
                    {atk.scToggles.map(sc => (
                      <div key={sc.label} style={{ marginBottom:3 }}>
                        <label style={{ fontSize:10, color: sc.checked ? "#f97316" : "#64748b", fontFamily:"var(--f)", display:"flex", alignItems:"center", gap:5, cursor:"pointer" }}>
                          <input type="checkbox" checked={sc.checked} onChange={e=>sc.set(e.target.checked)}
                            style={{ accentColor:"#f97316", width:11, height:11, cursor:"pointer" }} />
                          {sc.label}
                          {sc.extra && <span style={{ fontSize:8, color:"#f97316" }}>{sc.extra}</span>}
                        </label>
                        {sc.hint && <div style={{ fontSize:8, color:"#475569", fontFamily:"var(--f)", paddingLeft:16, lineHeight:1.3, marginTop:1 }}>{sc.hint}</div>}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:3 }}>
                      <label style={{ fontSize:10, color: atk.nat.enabled ? atk.nat.color : "#64748b", fontFamily:"var(--f)", textTransform:"uppercase", letterSpacing:0.5, display:"flex", alignItems:"center", gap:5, cursor:"pointer" }}>
                        <input type="checkbox" checked={atk.nat.enabled} onChange={e=>atk.nat.setEnabled(e.target.checked)}
                          style={{ accentColor: atk.nat.color, width:11, height:11, cursor:"pointer" }} />
                        {atk.nat.label}
                      </label>
                      <span style={{ fontSize:13, color: atk.nat.enabled ? "#e2e8f0" : "#475569", fontFamily:"var(--f)", fontWeight:600 }}>{fmtDate(atk.nat.date)}</span>
                    </div>
                    <div style={{ opacity: atk.nat.enabled ? 1 : 0.35, pointerEvents: atk.nat.enabled ? "auto" : "none" }}>
                      <input type="range" min={2025} max={2040} step={1/12} value={atk.nat.date}
                        onChange={e => atk.nat.setDate(parseFloat(e.target.value))}
                        style={{ width:"100%", accentColor: atk.nat.color }} />
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:"#475569", fontFamily:"var(--f)", marginTop:1 }}>
                        <span>2025</span><span>2030</span><span>2035</span><span>2040</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
        </div>{/* end export-dashboard */}

        <div id="export-outputs">
        <div style={{ display:"flex", gap:16, marginBottom:showAllGroups?8:20, flexWrap:"wrap" }}>
          {[{s:usS,label:"United States",flag:"",color:"#3b82f6",sd:effCnAtkStrikeDate,scT:usSCTargets},...(MODEL_CHINA ? [{s:cnS,label:"China",flag:"",color:"#d97706",sd:effUsAtkStrikeDate,scT:cnSCTargets}] : [])].map(({s,label,flag,color,sd,scT})=>{
            return (
            <div key={label} style={{ flex:1, minWidth:340, background:"rgba(15,23,42,0.6)", border:`1px solid ${color}22`, borderRadius:8, padding:"14px 16px" }}>
              <div style={{ fontSize:13, fontWeight:600, color, marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>{label}</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <MetricBox label="Sites disabled" value={<>{s.disabled}{scT > 0 && <span style={{ color:"#f97316", fontSize:11 }}> (+{scT})</span>}</>} sub={`${F(s.disabledGPUs)} GPUs (${s.totalGPUs>0?((s.disabledGPUs/s.totalGPUs)*100).toFixed(0)+"% of current":""})`} warn={s.disabled>0} />
                <MetricBox label="Sites to preempt" value={s.preemptedEffective ?? s.preempted} sub={(s.preemptedEffectiveGPUs ?? s.preemptedGPUs) > 0 ? `${F(s.preemptedEffectiveGPUs ?? s.preemptedGPUs)} H100-eq up until end of training window` : "none above threshold by end of training window"} warn={(s.preemptedEffective ?? s.preempted) > 0} />
                <MetricBox label="Compute destroyed" value={s.totalGPUs>0?((s.disabledGPUs/s.totalGPUs)*100).toFixed(0)+"%":"0%"}
                  sub={`${F(s.disabledGPUs)} of ${F(s.totalGPUs)} H100-eq at strike`}
                  warn={s.disabledGPUs/s.totalGPUs>0.5} good={s.disabledGPUs===0} />
                <MetricBox label="No-attack baseline" value={fmtDate(s.baselineDone)}
                  sub={s.baselineCluster?`${fmtDur(Math.max(0,s.baselineStart-NOW))} wait + ${fmtDur(Math.max(0,s.baselineDone-s.baselineStart))} train`:"no path"} />
                <MetricBox label="Earliest completion" value={fmtDate(s.earliestDone)}
                  sub={s.bestCluster?`via ${s.bestCluster.name.replace(" [EST]","")} (${s.bestStrategy})`:"no path"}
                  warn={s.earliestDone>2030} good={s.earliestDone-NOW<=1.5}
                  highlight />
                <MetricBox label={activeMilestoneLabel ? `Attack-caused delay (${activeMilestoneLabel})` : "Attack-caused delay"} value={s.attackDelay===Infinity||s.earliestDone>2050?">2050":fmtDur(s.attackDelay)}
                  sub={s.frozenYears>0&&s.attackDelay<Infinity&&s.attackDelay>0?`${((s.attackDelay/s.frozenYears)*100).toFixed(0)}% of total wait`:"—"}
                  warn={s.attackDelay>2} good={s.attackDelay<0.5&&s.attackDelay!==Infinity}
                  highlight />
              </div>
            </div>
          );})}
        </div>
        </div>{/* end export-outputs */}

        {/* Milestone arrival timeline — same chart as the PNG export, embedded.
            Sits between the strike-outcome dashboard and the visualization
            (training timeline + scatter + compute projections). */}
        {(usS.milestoneDates && cnS.milestoneDates) && (
          <div style={{ marginBottom:20, background:"rgba(15,23,42,0.5)", border:"1px solid #1e293b", borderRadius:8, padding:"14px 16px" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#94a3b8", fontFamily:"var(--f)", marginBottom:8 }}>
              Milestone arrival under strike
            </div>
            <MilestoneTimelineChart
              usS={usS}
              cnS={cnS}
              strikeUsDate={effUsAtkStrikeDate}
              strikeCnDate={effCnAtkStrikeDate}
            />
          </div>
        )}

        <div id="export-visuals">
        {/* Training run timeline visualization */}
        {(usS.baselineDone < Infinity || cnS.baselineDone < Infinity) && (
          <div style={{ marginBottom:20, background:"rgba(15,23,42,0.5)", border:"1px solid #1e293b", borderRadius:8, padding:"14px 16px" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"#94a3b8", fontFamily:"var(--f)", marginBottom:8 }}>Training Run Timeline</div>
            <TrainingTimeline usS={usS} cnS={MODEL_CHINA ? cnS : null} alpha={alpha}
              usStrikeDate={effCnAtkStrikeDate} cnStrikeDate={effUsAtkStrikeDate}
              usStrikeEnabled={cnAtkEnabled} cnStrikeEnabled={usAtkEnabled}
              fmtDate={fmtDate} fmtDur={fmtDur} milestoneLabel={activeMilestoneLabel} />
          </div>
        )}

        <div style={{ background:"rgba(15,23,42,0.5)", border:"1px solid #1e293b", borderRadius:8, padding:"16px" }}>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:8 }}>
            <Btn active={showSim} onClick={()=>setShowSim(!showSim)}>{showSim?"Hide":"Show"} simulated datacenters</Btn>
          </div>
          {(() => {
            // Hide sim clusters whose cumulative bottom-up sum is < 1% of that year's total
            // compute. Real clusters never hidden.
            const SIM_HIDDEN_PCT = 0.01;
            const yearTotalGpus = new Map();
            const simByYear = new Map();
            scPoints.forEach(pt => {
              const yr = Math.floor(pt.year);
              yearTotalGpus.set(yr, (yearTotalGpus.get(yr) || 0) + pt.gpus);
              if (!pt.sim) return;
              if (!simByYear.has(yr)) simByYear.set(yr, []);
              simByYear.get(yr).push(pt);
            });
            const hiddenSet = new Set();
            for (const [yr, pts] of simByYear) {
              pts.sort((a, b) => a.gpus - b.gpus);
              const threshold = (yearTotalGpus.get(yr) || 0) * SIM_HIDDEN_PCT;
              let cum = 0;
              for (const p of pts) {
                if (cum + p.gpus < threshold) { hiddenSet.add(p); cum += p.gpus; }
                else break;
              }
            }
            const chartPointsRaw = scPoints.filter(pt => !hiddenSet.has(pt));
            // Per-year top-10% threshold for sim clusters: anything below this skips
            // hover handlers (cuts ~90% of event listener count). Explicit (non-sim)
            // clusters always remain interactive.
            const simSizesByYear = new Map();
            for (const pt of chartPointsRaw) {
              if (!pt.sim) continue;
              const yr = Math.floor(pt.year);
              if (!simSizesByYear.has(yr)) simSizesByYear.set(yr, []);
              simSizesByYear.get(yr).push(pt.gpus);
            }
            const top10ByYear = new Map();
            for (const [yr, sizes] of simSizesByYear) {
              const sorted = [...sizes].sort((a, b) => b - a);
              const idx = Math.max(0, Math.floor(sorted.length * 0.1) - 1);
              top10ByYear.set(yr, sorted[idx] || 0);
            }
            const chartPoints = chartPointsRaw.map(pt => ({
              ...pt,
              topTier: !pt.sim || pt.gpus >= (top10ByYear.get(Math.floor(pt.year)) || 0),
            }));
            const hiddenCount = scPoints.length - chartPoints.length;
            return <>
          <Chart points={chartPoints} chainLinks={chainLinks} chainMembers={chainMembers}
            usAtkThreshold={effUsAtkThreshold} cnAtkThreshold={effCnAtkThreshold}
            usAtkStrikeDate={effUsAtkStrikeDate} cnAtkStrikeDate={effCnAtkStrikeDate}
            usAtkPreempt={usAtkPreempt} cnAtkPreempt={cnAtkPreempt}
            usAtkDenialYears={usAtkDenialYears} cnAtkDenialYears={cnAtkDenialYears}
            trainingRuns={[
              { ...usS, country: "US", color: "#3b82f6" },
              { ...cnS, country: "China", color: "#d97706" },
            ]}
            width={1060} height={540} />
          <div style={{ display:"flex", gap:16, marginTop:8, justifyContent:"center", flexWrap:"wrap" }}>
            <LI color="#3b82f6" label="US"/>
            <LI color="#d97706" label="China"/>
            {showAllGroups && <LI color="#22c55e" label="US Allies"/>}
            {showAllGroups && <LI color="#8b5cf6" label="Other"/>}
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <svg width={14} height={14} viewBox="0 0 14 14">
                <circle cx={7} cy={7} r={4.5} fill="#1e293b" stroke="#ef4444" strokeWidth={1.5}/>
                <line x1={4} y1={4} x2={10} y2={10} stroke="#ef4444" strokeWidth={1.5}/>
                <line x1={10} y1={4} x2={4} y2={10} stroke="#ef4444" strokeWidth={1.5}/>
              </svg>
              <span style={{fontSize:11,color:"#64748b",fontFamily:"var(--f)"}}>Disabled (existing)</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <svg width={14} height={14} viewBox="0 0 14 14">
                <circle cx={7} cy={7} r={4.5} fill="none" stroke="#ef4444" strokeWidth={1.2} strokeDasharray="2,2" opacity={0.6}/>
                <line x1={3} y1={11} x2={11} y2={3} stroke="#ef4444" strokeWidth={1.2} opacity={0.6}/>
              </svg>
              <span style={{fontSize:11,color:"#64748b",fontFamily:"var(--f)"}}>Preempted (planned)</span>
            </div>
            {showSim && <div style={{display:"flex",alignItems:"center",gap:5}}>
              <svg width={12} height={12} viewBox="0 0 12 12">
                <polygon points="6,1 7.5,4.5 11,4.5 8.25,7 9.5,11 6,8.5 2.5,11 3.75,7 1,4.5 4.5,4.5" fill="#818cf8" opacity={0.7}/>
              </svg>
              <span style={{fontSize:11,color:"#64748b",fontFamily:"var(--f)"}}>Simulated</span>
            </div>}
            {hiddenCount > 0 && (() => {
              // Compute breakdown of hidden clusters
              const hiddenPts = Array.from(hiddenSet);
              const byCountry = {};
              let totalGpus = 0;
              hiddenPts.forEach(pt => {
                if (!byCountry[pt.country]) byCountry[pt.country] = { count: 0, gpus: 0 };
                byCountry[pt.country].count += 1;
                byCountry[pt.country].gpus += pt.gpus;
                totalGpus += pt.gpus;
              });
              const countryColors = { US: "#3b82f6", China: "#d97706", Ally: "#22c55e", Other: "#8b5cf6" };
              const countryOrder = ["US", "China", "Ally", "Other"].filter(c => byCountry[c]);
              const minGpu = hiddenPts.reduce((m, p) => Math.min(m, p.gpus), Infinity);
              const maxGpu = hiddenPts.reduce((m, p) => Math.max(m, p.gpus), 0);
              return (
                <span
                  style={{ fontSize: 10, color: "#64748b", fontFamily: "var(--f)", cursor: "default", position: "relative", borderBottom: "1px dotted #475569", paddingBottom: 1 }}
                  onMouseEnter={() => setHiddenTipHover(true)}
                  onMouseLeave={() => setHiddenTipHover(false)}
                >
                  (+{hiddenCount} small sim clusters not shown — bottom 1% of yearly compute)
                  {hiddenTipHover && (
                    <div style={{
                      position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
                      background: "#0f172a", border: "1px solid #334155", borderRadius: 6, padding: "10px 14px",
                      width: 280, zIndex: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                      pointerEvents: "none",
                    }}>
                      <div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 600, marginBottom: 6 }}>
                        {hiddenCount} simulated clusters below display threshold
                      </div>
                      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 8, lineHeight: 1.5 }}>
                        Size range: {F(minGpu)} to {F(maxGpu)} H100-eq
                        <br />
                        Total compute: {F(totalGpus)} H100-eq
                      </div>
                      {/* Mini stacked bar */}
                      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                        {countryOrder.map(c => (
                          <div key={c} style={{ flex: byCountry[c].gpus, background: countryColors[c], opacity: 0.8 }} />
                        ))}
                      </div>
                      {countryOrder.map(c => (
                        <div key={c} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", lineHeight: 1.8 }}>
                          <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: countryColors[c], marginRight: 5, verticalAlign: "middle" }} />{c}</span>
                          <span>{byCountry[c].count} clusters, {F(byCountry[c].gpus)} H100-eq</span>
                        </div>
                      ))}
                      {/* Arrow */}
                      <div style={{
                        position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)",
                        width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #334155",
                      }} />
                    </div>
                  )}
                </span>
              );
            })()}
          </div>
          <div style={{ fontSize:10, color:"#475569", fontStyle:"italic", marginTop:6, textAlign:"center" }}>
            Cluster dots are sampled from the bucket distributions for visualization;
            reported strike metrics are computed from the underlying expected values.
          </div>
          </>;
          })()}
        </div>
        </div>{/* end export-visuals */}

        {/* === Projection Charts === */}
        <div style={{ marginTop: 24, marginBottom: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: 2, color: "#6366f1", textTransform: "uppercase", fontWeight: 600 }}>Compute Projections</span>
          <p style={{ fontSize: 12, color: "#475569", margin: "4px 0 16px 0", lineHeight: 1.5 }}>
            Based on AI Futures Project Compute and Software Efficiency Forecasts.
          </p>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          {/* Global compute + Growth rate in one panel */}
          <div style={{ flex: "1 1 100%", background: "rgba(15,23,42,0.5)", border: "1px solid #1e293b", borderRadius: 8, padding: "16px", display: "flex", gap: 0 }}>
            <div style={{ flex: "0 0 auto" }}>
              {(() => {
                const anyAtk = usAtkEnabled || cnAtkEnabled;
                const earliestStrike = Math.min(
                  cnAtkEnabled ? effCnAtkStrikeDate : Infinity,
                  usAtkEnabled ? effUsAtkStrikeDate : Infinity
                );
                // Build post-attack display series: baseline before strike, adjusted after
                const buildDisplaySeries = () => {
                  const base = projections.baselineGlobalSeries;
                  const adj = projections.globalSeries;
                  const result = [];
                  // Add baseline points before strike
                  for (const [yr, v] of base) {
                    if (yr < earliestStrike) result.push([yr, v]);
                  }
                  // Add interpolated point at strike using baseline value
                  const bBefore = base.filter(d => d[0] <= earliestStrike).pop();
                  const bAfter = base.find(d => d[0] > earliestStrike);
                  if (bBefore && bAfter && earliestStrike > bBefore[0]) {
                    const t = (earliestStrike - bBefore[0]) / (bAfter[0] - bBefore[0]);
                    const logV = Math.log10(bBefore[1]) + t * (Math.log10(bAfter[1]) - Math.log10(bBefore[1]));
                    result.push([earliestStrike, Math.pow(10, logV)]);
                  }
                  // Add adjusted points after strike
                  for (const [yr, v] of adj) {
                    if (yr >= earliestStrike) result.push([yr, v]);
                  }
                  return result;
                };
                return (
                  <ProjectionChart
                    title="Global AI Compute"
                    subtitle="Total H100-equivalents worldwide (AIFP projections)"
                    series={[
                      ...(anyAtk ? [{ data: projections.baselineGlobalSeries, color: "#a78bfa", label: "Baseline", dashed: true }] : []),
                      { data: anyAtk ? buildDisplaySeries() : projections.globalSeries, color: anyAtk ? "#ef4444" : "#a78bfa", label: anyAtk ? "Post-attack" : "Global", bold: true },
                    ]}
                    xMin={2022} xMax={2040} yMin={300000} yMax={10000000000}
                    logY width={370} height={320}
                    yLabel="H100-equivalents"
                    xTicks={[2022, 2025, 2028, 2031, 2034, 2037, 2040]}
                    yTicks={[1e6, 1e7, 1e8, 1e9, 1e10]}
                    nowLine
                    strikeLines={[
                      ...(cnAtkEnabled ? [{ date: effCnAtkStrikeDate, color: "#d97706", label: "CN\u2192US" }] : []),
                      ...(usAtkEnabled ? [{ date: effUsAtkStrikeDate, color: "#3b82f6", label: "US\u2192CN" }] : []),
                    ]}
                  />
                );
              })()}
            </div>
            <div style={{ flex: "0 0 100px", paddingTop: 40, paddingLeft: 6, paddingRight: 6, borderLeft: "1px solid #1e293b22" }}>
              <StatItem label="2026" value={F(projections.adjAifpAt(2026)?.global || 0)} color="#a78bfa" sub="current" />
              <StatItem label="2030" value={F(projections.adjAifpAt(2030)?.global || 0)} color="#a78bfa" sub={`${(projections.adjAifpAt(2030)?.global / projections.adjAifpAt(2026)?.global).toFixed(0)}\u00D7 vs now`} />
              <StatItem label="2035" value={F(projections.adjAifpAt(2035)?.global || 0)} color="#a78bfa" sub={`${(projections.adjAifpAt(2035)?.global / projections.adjAifpAt(2026)?.global).toFixed(0)}\u00D7 vs now`} />
            </div>
            <div style={{ flex: "0 0 auto", borderLeft: "1px solid #1e293b44" }}>
              {(() => {
                const minGrowth = Math.min(...projections.growthSeries.map(d => d[1]).filter(v => isFinite(v)), 1.0);
                return (
                  <ProjectionChart
                    title="Compute Growth Rate"
                    subtitle="Year-over-year multiplier"
                    series={[
                      { data: projections.growthSeries, color: "#c084fc", label: "Y/Y", bold: true },
                    ]}
                    xMin={2022} xMax={2040} yMin={Math.min(minGrowth - 0.1, 0.5)} yMax={3.2}
                    logY={false} width={340} height={320}
                    yLabel="Y/Y multiplier"
                    yFormat={v => v.toFixed(1) + "\u00D7"}
                    xTicks={[2023, 2026, 2029, 2032, 2035, 2038, 2040]}
                    yTicks={[...(minGrowth < 0.9 ? [0.5] : []), ...(minGrowth < 1.0 ? [0.8] : []), 1.0, 1.5, 2.0, 2.5, 3.0]}
                    nowLine
                    strikeLines={[
                      ...(cnAtkEnabled ? [{ date: effCnAtkStrikeDate, color: "#d97706", label: "CN\u2192US" }] : []),
                      ...(usAtkEnabled ? [{ date: effUsAtkStrikeDate, color: "#3b82f6", label: "US\u2192CN" }] : []),
                    ]}
                  />
                );
              })()}
            </div>
            {(() => {
              const g = projections.growthSeries;
              const at = yr => { const r = g.find(([y]) => y === yr); return r ? r[1] : null; };
              return (
                <div style={{ flex: "0 0 100px", paddingTop: 40, paddingLeft: 6, borderLeft: "1px solid #1e293b22" }}>
                  <StatItem label="Peak" value={`${at(2025)?.toFixed(2)}\u00D7`} color="#c084fc" sub="2025" />
                  <StatItem label="2026" value={`${at(2026)?.toFixed(2)}\u00D7`} color="#c084fc" sub="current" />
                  <StatItem label="2030" value={`${at(2030)?.toFixed(2)}\u00D7`} color="#c084fc" />
                  <StatItem label="2035" value={`${at(2035)?.toFixed(2)}\u00D7`} color="#c084fc" />
                </div>
              );
            })()}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          {/* Algorithmic efficiency multiplier */}
          <div style={{ flex: 1, minWidth: 500, background: "rgba(15,23,42,0.5)", border: "1px solid #1e293b", borderRadius: 8, padding: "16px", display: "flex", gap: 0 }}>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              {(() => {
                const anyStrike = usAtkEnabled || cnAtkEnabled;
                const allSeriesData = [
                  ...(usS.baselineAlgoSeries || []),
                  ...(cnS.baselineAlgoSeries || []),
                  ...(anyStrike ? (usS.attackAlgoSeries || []) : []),
                  ...(anyStrike ? (cnS.attackAlgoSeries || []) : []),
                ];
                const maxVal = Math.max(...allSeriesData.filter(d => d[0] <= 2040).map(d => d[1]).filter(v => v > 0), 10);
                const series = [
                  { data: usS.baselineAlgoSeries || [], color: "#3b82f6", label: "US", bold: true },
                  { data: cnS.baselineAlgoSeries || [], color: "#d97706", label: "CN", bold: true },
                ];
                if (anyStrike) {
                  series.push({ data: usS.attackAlgoSeries || [], color: "#3b82f6", label: "US post-atk", dashed: true });
                  series.push({ data: cnS.attackAlgoSeries || [], color: "#d97706", label: "CN post-atk", dashed: true });
                }
                return (
                  <ProjectionChart
                    title="Algorithmic Efficiency Multiplier"
                    subtitle={(useAifpBackend && backendStatus === "connected") ? "" : (rate > 0 ? `${halvingMonths}-month halving local model (${rate.toFixed(2)} OOM/yr present-day)` : "No algorithmic improvement")}
                    series={series}
                    xMin={2024} xMax={2040} yMin={0.8} yMax={Math.pow(10, Math.ceil(Math.log10(Math.max(maxVal, 2))))}
                    logY width={400} height={320}
                    yLabel="Effective FLOP multiplier"
                    yFormat={v => v >= 1000000 ? (v/1000000).toFixed(0)+"M\u00D7" : v >= 1000 ? (v/1000).toFixed(0)+"K\u00D7" : v >= 1 ? v.toFixed(0)+"\u00D7" : v.toFixed(1)+"\u00D7"}
                    xTicks={[2024, 2026, 2028, 2030, 2032, 2034, 2036, 2038, 2040]}
                    yTicks={(() => {
                      const ticks = [1, 10, 100, 1000, 10000, 100000, 1000000];
                      return ticks.filter(v => v <= maxVal * 1.5);
                    })()}
                    nowLine
                    strikeLines={[
                      ...(cnAtkEnabled ? [{ date: cnAtkStrikeDate, color: "#d97706", label: "CN\u2192US" }] : []),
                      ...(usAtkEnabled ? [{ date: usAtkStrikeDate, color: "#3b82f6", label: "US\u2192CN" }] : []),
                    ]}
                  />
                );
              })()}
            </div>
          </div>

          {/* Algorithmic progress rate (OOM/yr at any given month) */}
          <div style={{ flex: 1, minWidth: 500, background: "rgba(15,23,42,0.5)", border: "1px solid #1e293b", borderRadius: 8, padding: "16px", display: "flex", gap: 0 }}>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              {(() => {
                // When the AIFP backend is connected, software_progress_rate
                // is returned directly per scenario in OOM/yr. Use that as
                // the source of truth. Otherwise fall back to the local
                // finite-difference of the algo multiplier (baselineRateSeries
                // / attackRateSeries store [yr, 10^rate]; convert with log10).
                const sampleBackendRate = (id) => {
                  const fn = remoteRateFns[id];
                  if (!fn) return null;
                  // Apply κ-diffusion for China rates: max(cn, (1-κ)*cn + κ*us).
                  const isCn = id.startsWith("China-");
                  const usFn = isCn && diffusion > 0 ? remoteRateFns[id.replace("China-", "US-")] : null;
                  const out = [];
                  for (let yr = 2024; yr <= 2040 + 1e-9; yr += 0.1) {
                    let v = fn(yr);
                    if (usFn) {
                      const usR = Math.max(0, usFn(yr) || 0);
                      const cnR = Math.max(0, v || 0);
                      v = Math.max(cnR, (1 - diffusion) * cnR + diffusion * usR);
                    }
                    if (Number.isFinite(v)) out.push([yr, v]);
                  }
                  return out;
                };
                const useBackend = useAifpBackend && backendStatus === "connected";
                const fallback = (series) => (series || [])
                  .filter(d => d && d[1] > 0)
                  .map(d => [d[0], Math.log10(d[1])]);
                const anyStrike = usAtkEnabled || cnAtkEnabled;
                const usBase = (useBackend && sampleBackendRate("US-baseline")) || fallback(usS.baselineRateSeries);
                const cnBase = (useBackend && sampleBackendRate("China-baseline")) || fallback(cnS.baselineRateSeries);
                const usAtk = anyStrike ? ((useBackend && sampleBackendRate("US-attack")) || fallback(usS.attackRateSeries)) : [];
                const cnAtk = anyStrike ? ((useBackend && sampleBackendRate("China-attack")) || fallback(cnS.attackRateSeries)) : [];
                const all = [...usBase, ...cnBase, ...usAtk, ...cnAtk].filter(d => d[0] <= 2040);
                const yMax = Math.max(2, Math.ceil(Math.max(...all.map(d => d[1]), 1) * 1.1));
                const series = [
                  { data: usBase, color: "#3b82f6", label: "US", bold: true },
                  { data: cnBase, color: "#d97706", label: "CN", bold: true },
                ];
                if (anyStrike) {
                  series.push({ data: usAtk, color: "#3b82f6", label: "US post-atk", dashed: true });
                  series.push({ data: cnAtk, color: "#d97706", label: "CN post-atk", dashed: true });
                }
                const niceStep = yMax <= 2 ? 0.25 : yMax <= 4 ? 0.5 : yMax <= 8 ? 1 : 2;
                const yTicksRate = [];
                for (let v = 0; v <= yMax + 1e-9; v += niceStep) yTicksRate.push(Number(v.toFixed(2)));
                return (
                  <ProjectionChart
                    title="Algorithmic Progress Rate"
                    subtitle={useBackend ? "Software-efficiency rate (OOM/yr at each month)" : "Yearly software-efficiency growth rate (local model, OOM/yr)"}
                    series={series}
                    xMin={2024} xMax={2040} yMin={0} yMax={yMax}
                    width={400} height={320}
                    yLabel="OOM / year"
                    yFormat={v => v.toFixed(niceStep < 1 ? 2 : 1)}
                    xTicks={[2024, 2026, 2028, 2030, 2032, 2034, 2036, 2038, 2040]}
                    yTicks={yTicksRate}
                    nowLine
                    strikeLines={[
                      ...(cnAtkEnabled ? [{ date: cnAtkStrikeDate, color: "#d97706", label: "CN\u2192US" }] : []),
                      ...(usAtkEnabled ? [{ date: usAtkStrikeDate, color: "#3b82f6", label: "US\u2192CN" }] : []),
                    ]}
                  />
                );
              })()}
            </div>
          </div>
        </div>

        {/* US compute + allocation */}
        <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid #1e293b", borderRadius: 8, padding: "16px", display: "flex", gap: 0, marginBottom: 16 }}>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            {(() => {
              const maxVal = Math.max(...projections.usTotalSeries.map(d => d[1]));
              const minVal = Math.min(...projections.usTotalSeries.filter(d => d[1] > 0).map(d => d[1]));
              const yMin = Math.pow(10, Math.floor(Math.log10(Math.max(minVal, 1e3))));
              const yMax = Math.pow(10, Math.ceil(Math.log10(maxVal * 1.1)));
              const yTicks = [];
              for (let v = yMin; v <= yMax; v *= 10) yTicks.push(v);
              return (
                <ProjectionChart
                  title="United States Compute"
                  subtitle={usNatEnabled ? `Nationalized ${Math.floor(usNatDate)} (90% of national)` : "79.9% of global compute"}
                  series={[
                    { data: projections.usTotalSeries, color: "#3b82f6", label: "US total", bold: true },
                    { data: projections.usLeadingSeries, color: "#60a5fa", label: usNatEnabled ? "Lead co. (nat.)" : "Leading co.", fill: "rgba(96,165,250,0.12)" },
                    { data: projections.usExperimentalSeries, color: "#22d3ee", label: `Experimental (${(alloc.experimental*100).toFixed(0)}%)`, dashed: true },
                    { data: projections.usTrainingSeries, color: "#818cf8", label: `Training (${(alloc.training*100).toFixed(0)}%)`, dashed: true },
                  ]}
                  xMin={2024} xMax={2035} yMin={yMin} yMax={yMax} logY
                  width={380} height={340}
                  yLabel="H100-equivalents (log)"
                  xTicks={[2024, 2026, 2028, 2030, 2032, 2034]}
                  yTicks={yTicks}
                  yFormat={v => v >= 1e9 ? (v/1e9)+"B" : v >= 1e6 ? (v/1e6)+"M" : v >= 1e3 ? (v/1e3)+"K" : v.toString()}
                  nowLine
                  strikeLines={cnAtkEnabled ? [{ date: cnAtkStrikeDate, color: "#d97706", label: "CN\u2192US" }] : []}
                />
              );
            })()}
          </div>
          <div style={{ flex: "0 0 auto", paddingTop: 20, paddingLeft: 4, borderLeft: "1px solid #1e293b22" }}>
            {(() => {
              const d30 = projections.adjAifpAt(2030);
              const lead30 = (usNatEnabled && 2030 >= usNatDate) ? d30.usTotal * 0.9 : d30.usLead;
              return <AllocationPie alloc={alloc} wartime={wartime} setWartime={null} accentColor="#60a5fa" title="US Allocation" width={220} height={290} stats={[
                { label: "Lead co. 2030", value: F(lead30), color: "#60a5fa", sub: `${((usNatEnabled && 2030 >= usNatDate) ? 90 : (d30.natShare * 100)).toFixed(0)}% of national` },
              ]} />;
            })()}
          </div>
          {(() => {
            const d26 = projections.adjAifpAt(2026), d30 = projections.adjAifpAt(2030), d35 = projections.adjAifpAt(2035);
            const lead = (d, yr) => (usNatEnabled && yr >= usNatDate) ? d.usTotal * 0.9 : d.usLead;
            const share = (d, yr) => (usNatEnabled && yr >= usNatDate) ? 0.9 : d.natShare;
            return (
              <div style={{ flex: "0 0 130px", paddingTop: 40, paddingLeft: 8, borderLeft: "1px solid #1e293b22" }}>
                <StatItem label="US total 2026" value={F(d26.usTotal)} color="#3b82f6" />
                <StatItem label="US total 2030" value={F(d30.usTotal)} color="#3b82f6" />
                <StatItem label="US total 2035" value={F(d35.usTotal)} color="#3b82f6" />
                <div style={{ borderTop: "1px solid #1e293b", margin: "6px 0", paddingTop: 6 }} />
                <StatItem label="Lead co. 2026" value={F(lead(d26,2026))} color="#60a5fa" sub={`${(share(d26,2026) * 100).toFixed(0)}% of national`} />
                <StatItem label="Lead co. 2030" value={F(lead(d30,2030))} color="#60a5fa" sub={`${(share(d30,2030) * 100).toFixed(0)}% of national`} />
                <StatItem label="Lead co. 2035" value={F(lead(d35,2035))} color="#60a5fa" sub={`${(share(d35,2035) * 100).toFixed(0)}% of national`} />
              </div>
            );
          })()}
        </div>

        {/* China compute + allocation */}
        <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid #1e293b", borderRadius: 8, padding: "16px", display: "flex", gap: 0, marginBottom: 20 }}>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            {(() => {
              const maxVal = Math.max(...projections.chinaTotalSeries.map(d => d[1]));
              const minVal = Math.min(...projections.chinaTotalSeries.filter(d => d[1] > 0).map(d => d[1]));
              const yMin = Math.pow(10, Math.floor(Math.log10(Math.max(minVal, 1e3))));
              const yMax = Math.pow(10, Math.ceil(Math.log10(maxVal * 1.1)));
              const yTicks = [];
              for (let v = yMin; v <= yMax; v *= 10) yTicks.push(v);
              return (
                <ProjectionChart
                  title="China Compute"
                  subtitle={cnNatEnabled ? `Nationalized ${Math.floor(cnNatDate)} (90% of national)` : "13.8% of global compute"}
                  series={[
                    { data: projections.chinaTotalSeries, color: "#d97706", label: "China total", bold: true },
                    { data: projections.chinaLeadingSeries, color: "#fbbf24", label: cnNatEnabled ? "Lead co. (nat.)" : "Leading co.", fill: "rgba(251,191,36,0.10)" },
                    { data: projections.cnExperimentalSeries, color: "#22d3ee", label: `Experimental (${(cnAlloc.experimental*100).toFixed(0)}%)`, dashed: true },
                    { data: projections.cnTrainingSeries, color: "#818cf8", label: `Training (${(cnAlloc.training*100).toFixed(0)}%)`, dashed: true },
                  ]}
                  xMin={2024} xMax={2035} yMin={yMin} yMax={yMax} logY
                  width={380} height={340}
                  yLabel="H100-equivalents (log)"
                  xTicks={[2024, 2026, 2028, 2030, 2032, 2034]}
                  yTicks={yTicks}
                  yFormat={v => v >= 1e9 ? (v/1e9)+"B" : v >= 1e6 ? (v/1e6)+"M" : v >= 1e3 ? (v/1e3)+"K" : v.toString()}
                  nowLine
                  strikeLines={usAtkEnabled ? [{ date: usAtkStrikeDate, color: "#3b82f6", label: "US\u2192CN" }] : []}
                />
              );
            })()}
          </div>
          <div style={{ flex: "0 0 auto", paddingTop: 20, paddingLeft: 0 }}>
            {(() => {
              const d30 = projections.adjAifpAt(2030);
              const lead30 = (cnNatEnabled && 2030 >= cnNatDate) ? d30.cnTotal * 0.9 : d30.cnLead;
              return <AllocationPie alloc={cnAlloc} wartime={cnWartime} setWartime={null} accentColor="#fbbf24" title="CN Allocation" width={220} height={290} stats={[
                { label: "Lead co. 2030", value: F(lead30), color: "#fbbf24", sub: `${((cnNatEnabled && 2030 >= cnNatDate) ? 90 : (d30.natShare * 100)).toFixed(0)}% of national` },
              ]} />;
            })()}
          </div>
          {(() => {
            const d26 = projections.adjAifpAt(2026), d30 = projections.adjAifpAt(2030), d35 = projections.adjAifpAt(2035);
            const lead = (d, yr) => (cnNatEnabled && yr >= cnNatDate) ? d.cnTotal * 0.9 : d.cnLead;
            const share = (d, yr) => (cnNatEnabled && yr >= cnNatDate) ? 0.9 : d.natShare;
            return (
              <div style={{ flex: "0 0 130px", paddingTop: 40, paddingLeft: 8, borderLeft: "1px solid #1e293b22" }}>
                <StatItem label="CN total 2026" value={F(d26.cnTotal)} color="#d97706" />
                <StatItem label="CN total 2030" value={F(d30.cnTotal)} color="#d97706" />
                <StatItem label="CN total 2035" value={F(d35.cnTotal)} color="#d97706" />
                <div style={{ borderTop: "1px solid #1e293b", margin: "6px 0", paddingTop: 6 }} />
                <StatItem label="Lead co. 2026" value={F(lead(d26,2026))} color="#fbbf24" sub={`${(share(d26,2026) * 100).toFixed(0)}% of national`} />
                <StatItem label="Lead co. 2030" value={F(lead(d30,2030))} color="#fbbf24" sub={`${(share(d30,2030) * 100).toFixed(0)}% of national`} />
                <StatItem label="Lead co. 2035" value={F(lead(d35,2035))} color="#fbbf24" sub={`${(share(d35,2035) * 100).toFixed(0)}% of national`} />
              </div>
            );
          })()}
        </div>

      </div>
    </div>
  );
}
