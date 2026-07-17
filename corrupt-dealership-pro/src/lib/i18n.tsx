"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { cityState } from "@/config/site";

// Translation dictionary ported verbatim from legacy_v1/js/index.js
const translations = {
  en: {
    heroTitle: "YOUR NEXT RIDE STARTS HERE",
    heroSubtitle: "No credit needed. Your job is your credit. Drive home today with guaranteed financing.",
    viewInventory: "View Inventory",
    applyNow: "Apply Now",
    searchPlaceholder: "Search by make, model, year...",
    allVehicles: "All Vehicles",
    trucks: "Trucks",
    suvs: "SUV's",
    sedans: "Sedans",
    golfCarts: "Golf Carts",
    utvs: "UTV's",
    allLots: "All Lots",
    newestFirst: "Newest First",
    priceLow: "Price: Low → High",
    priceHigh: "Price: High → Low",
    mileageLow: "Mileage: Low → High",
    vehicles: "Vehicles",
    preApproval: "Pre-Approval Center",
    flexibleFinancing: "Flexible Financing Paths",
    financingDesc:
      `Whether you are looking for competitive bank terms or simple in-house financing in ${cityState}, we offer secure financing paths tailored directly to your situation.`,
    bankPartners: "Bank & Credit Union Partners",
    bankDesc: "We work directly with our partner banks and credit unions for competitive rates.",
    bhph: "Buy Here Pay Here (BHPH) In-House",
    bhphDesc: "No credit required. Your job is your credit. Available for qualifying accounts.",
    paymentEstimator: "Payment Estimator",
    vehiclePrice: "Vehicle Price ($)",
    downPayment: "Down Payment ($)",
    loanTerm: "Loan Term",
    estMonthly: "Estimated Monthly Payment",
    calcDisclaimer: "*Estimate only. Actual terms vary by credit and lender. Does not include tax, title, or fees.",
    creditApp: "START YOUR APPLICATION",
    fullName: "Full Name",
    email: "Email Address",
    phone: "Phone Number",
    monthlyIncome: "Monthly Income",
    employmentStatus: "Employment Status",
    employed: "Employed",
    selfEmployed: "Self-Employed",
    retired: "Retired",
    other: "Other",
    submitApp: "Submit Pre-Approval Application",
    getInTouch: "Get In Touch",
    visitUs: "VISIT US TODAY",
    callNow: "Call Now",
    textUs: "Text Us",
    mileageLabel: "mi",
    langToggle: "🇪🇸 ES",
  },
  es: {
    heroTitle: "TU PRÓXIMO AUTO EMPIEZA AQUÍ",
    heroSubtitle: "No necesitas crédito. Tu trabajo es tu crédito. Maneja a casa hoy con financiamiento garantizado.",
    viewInventory: "Ver Inventario",
    applyNow: "Aplica Ahora",
    searchPlaceholder: "Buscar por marca, modelo, año...",
    allVehicles: "Todos",
    trucks: "Camionetas",
    suvs: "SUVs",
    sedans: "Sedanes",
    golfCarts: "Golf Carts",
    utvs: "UTVs",
    allLots: "Todos",
    newestFirst: "Más Recientes",
    priceLow: "Precio: Bajo → Alto",
    priceHigh: "Precio: Alto → Bajo",
    mileageLow: "Millaje: Bajo → Alto",
    vehicles: "Vehículos",
    preApproval: "Centro de Pre-Aprobación",
    flexibleFinancing: "Opciones de Financiamiento",
    financingDesc:
      `Ya sea que busques términos bancarios competitivos o financiamiento directo en ${cityState}, ofrecemos opciones adaptadas a tu situación.`,
    bankPartners: "Socios Bancarios",
    bankDesc: "Trabajamos directamente con nuestros bancos y cooperativas de crédito asociados para tasas competitivas.",
    bhph: "Compra Aquí Paga Aquí (BHPH)",
    bhphDesc: "No se requiere crédito. Tu trabajo es tu crédito. Disponible para cuentas calificadas.",
    paymentEstimator: "Calculadora de Pagos",
    vehiclePrice: "Precio del Vehículo ($)",
    downPayment: "Enganche ($)",
    loanTerm: "Plazo del Préstamo",
    estMonthly: "Pago Mensual Estimado",
    calcDisclaimer: "*Solo es un estimado. Los términos reales varían según crédito y prestamista. No incluye impuestos ni cargos.",
    creditApp: "INICIA TU SOLICITUD",
    fullName: "Nombre Completo",
    email: "Correo Electrónico",
    phone: "Número de Teléfono",
    monthlyIncome: "Ingreso Mensual",
    employmentStatus: "Estado de Empleo",
    employed: "Empleado",
    selfEmployed: "Independiente",
    retired: "Jubilado",
    other: "Otro",
    submitApp: "Enviar Solicitud de Pre-Aprobación",
    getInTouch: "Contáctanos",
    visitUs: "VISÍTANOS HOY",
    callNow: "Llamar",
    textUs: "Mensaje",
    mileageLabel: "mi",
    langToggle: "🇺🇸 EN",
  },
} as const;

export type Lang = keyof typeof translations;
export type TranslationKey = keyof (typeof translations)["en"];

const STORAGE_KEY = "dealership-lang";

interface LanguageContextValue {
  lang: Lang;
  t: (key: TranslationKey) => string;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  t: key => translations.en[key],
  toggleLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  // Read persisted preference after mount — localStorage isn't available during
  // SSR, so this must happen post-hydration to avoid a markup mismatch.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time browser-only state sync
    if (stored === "es") setLang("es");
  }, []);

  const toggleLanguage = () => {
    setLang(current => {
      const next = current === "en" ? "es" : "en";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  return (
    <LanguageContext.Provider value={{ lang, t: key => translations[lang][key], toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
