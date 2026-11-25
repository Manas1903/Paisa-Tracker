import type { CreditCard } from "./data";

export type RegistryEntry = {
  rewards: NonNullable<CreditCard["rewards"]>;
  note: string;
  source: string;
  checkedOn: string;
};

export type CardSourceInfo = { note: string; source: string; checkedOn: string };

// Research links are shown for every card in this app. Cards without a numeric
// registry entry need issuer/version or MCC detail the app cannot infer safely.
export const CARD_SOURCE_INFO: Record<string, CardSourceInfo> = {
  "SBI Pulse": { note: "The 7,500 RP accelerated cap is ₹1,875; base points continue after the cap. Keyword categories approximate MCC eligibility.", source: "https://www.sbicard.com/sbi-card-en/assets/docs/pdf/Pulse-tnc-booklet-combined.pdf", checkedOn: "2026-11-25" },
  "SBI BPCL Octane": { note: "Rates converted at 4 RP = ₹1. Non-BPCL fuel exclusions and eligible MCC/MID categories cannot be fully identified from merchant text; other-retail base points are therefore not prefilled.", source: "https://www.sbicard.com/sbi-card-en/assets/docs/pdf/ekit-tncs/BPCLOctanetnc.pdf", checkedOn: "2026-11-25" },
  "SBI PhonePe Black": { note: "No preset: 2026 rules depend on PhonePe/app/MCC eligibility, and several reward caps differ by spend type.", source: "https://www.sbicard.com/lscs/v1/rsvnlt/nodeid/16197311228453450023", checkedOn: "2026-11-25" },
  "HDFC Swiggy": { note: "Eligible app and online spends depend on merchant IDs/MCCs; only the keyword-identifiable app rule and base are prefilled.", source: "https://www.hdfcbank.com/content/bbp/repositories/723fb80a-2dde-42a3-9793-7ae1be57c87f/?path=%2FPersonal%2FPay%2FCards%2FCredit+Card%2FCredit+Card+Landing+Page%2FCredit+Cards%2FSwiggy+HDFC+Bank+Credit+Card%2FT-and-C-Swiggy-HDFC-Bank-Credit-Card.pdf", checkedOn: "2026-11-25" },
  OneCard: { note: "BOBCARD One terms say 1 point/₹50 and 5X on the top two monthly categories after qualifying spends, but redemption value is variable; no ₹ estimate is prefilled.", source: "https://assets.getonecard.app/assets/legal/BOBCARD_TC_4-12-24_1740487814775.pdf", checkedOn: "2026-11-25" },
  "BOB Eterna": { note: "5X categories capped at 5,000 points per statement cycle; further eligible spends earn the core rate. Keyword categories approximate MCC eligibility.", source: "https://www.bobcard.co.in/credit-card-types/eterna", checkedOn: "2026-11-25" },
  "IndusInd EazyDiner Platinum": { note: "No preset: regular and reduced earn rates apply to different issuer-defined categories; cashback value is redemption-dependent.", source: "https://www.indusind.com/content/dam/indusind-corporate/Other/welcomekit/credit-card-benefits/EazyDiner_Platinum_Benefit_Guide.pdf", checkedOn: "2026-11-25" },
  "Jupiter Edge+": { note: "No preset: Jewels conversion varies by redemption option; category rates and caps depend on card variant and Jupiter app use.", source: "https://jupiter.money/edge-csb-terms-conditions/", checkedOn: "2026-11-25" },
};

// Only rates that can be conservatively represented with the app's merchant/category keywords.
// Card terms change; users should compare these values with their own current terms.
export const CARD_REGISTRY: Record<string, RegistryEntry> = {
  "SBI Pulse": {
    rewards: {
      base: 0.5,
      bonus: [{ match: "chemist|pharmacy|sports|dining|movies", rate: 2.5, capPerMonth: 1875, fallbackToBase: true }],
      exclude: "fuel|petrol|wallet|cash advance|cash withdrawal|balance transfer|fees|charges|emi",
    },
    note: "2 RP/₹100 base and 10 RP/₹100 on dining, movies, pharmacy/chemist and sports; 4 RP = ₹1. Accelerated cap 7,500 RP/month, then base rate. Keyword matching approximates MCC eligibility.",
    source: "https://www.sbicard.com/sbi-card-en/assets/docs/pdf/Pulse-tnc-booklet-combined.pdf",
    checkedOn: "2026-11-25",
  },
  "SBI BPCL Octane": {
    rewards: {
      base: 0,
      bonus: [
        { match: "bpcl|bharat petroleum", rate: 6.25, capPerMonth: 625 },
        { match: "dining|department store|grocery|movies", rate: 2.5, capPerMonth: 1875 },
        { match: "bharat gas", rate: 6.25, capPerMonth: 125 },
      ],
      exclude: "non-bpcl fuel|hpcl|indian oil|shell|nayara|wallet|cash advance|cash withdrawal|balance transfer|fees|charges|emi|rent",
      spendCapPerMonth: 10000,
    },
    note: "BPCL fuel 25 RP/₹100; dining/grocery/department stores/movies 10 RP/₹100; Bharat Gas 25 RP/₹100. 4 RP = ₹1. Caps converted to ₹625/₹1,875/₹125 plus ₹10,000 eligible spend/month. Other-retail base points and non-BPCL exclusions are not prefilled. Fuel surcharge waiver excluded.",
    source: "https://www.sbicard.com/sbi-card-en/assets/docs/pdf/ekit-tncs/BPCLOctanetnc.pdf",
    checkedOn: "2026-11-25",
  },
  "HDFC Swiggy": {
    rewards: {
      base: 1,
      baseCapPerMonth: 500,
      bonus: [{ match: "swiggy", rate: 10, capPerMonth: 1500 }],
      exclude: "fuel|rent|jewellery|government|emi|wallet|cash advance|travellers cheque|foreign currency|fees|insurance|education|swiggy money wallet|swiggy liquor|swiggy minis",
      minTransaction: 100,
      roundPerTransaction: true,
    },
    note: "1% other cashback capped ₹500/cycle; Swiggy app 10% capped ₹1,500/cycle. 5% eligible online-MCC list is not prefilled. App/product eligibility is approximated from merchant text.",
    source: "https://www.hdfcbank.com/content/bbp/repositories/723fb80a-2dde-42a3-9793-7ae1be57c87f/?path=%2FPersonal%2FPay%2FCards%2FCredit+Card%2FCredit+Card+Landing+Page%2FCredit+Cards%2FSwiggy+HDFC+Bank+Credit+Card%2FT-and-C-Swiggy-HDFC-Bank-Credit-Card.pdf",
    checkedOn: "2026-11-25",
  },
  "BOB Eterna": {
    rewards: {
      base: 0.75,
      bonus: [{ match: "travel|dining|online|international", rate: 3.75, capPerMonth: 1250, fallbackToBase: true }],
      exclude: "fuel",
    },
    note: "Core 3 RP/₹100; 15 RP/₹100 on travel, dining, online and international (1 RP = ₹0.25). 5X categories capped at 5,000 RP/cycle, then core rate. Merchant text approximates MCC eligibility.",
    source: "https://www.bobcard.co.in/credit-card-types/eterna",
    checkedOn: "2026-11-25",
  },
};
