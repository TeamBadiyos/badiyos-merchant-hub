import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "mr";

const dict = {
  en: {
    tagline: "Merchant Portal",
    subTagline: "Grow your shop in Latur",
    loginTitle: "Login to your shop",
    loginSub: "We'll send an OTP on WhatsApp",
    mobile: "Mobile number",
    sendOtp: "Send OTP on WhatsApp",
    otpTitle: "Enter OTP",
    otpSub: "6-digit code sent on WhatsApp to",
    resend: "Resend code",
    verify: "Verify",
    changeNumber: "Change number",
    pinTitle: "Set a 4-digit PIN",
    pinSub: "Use it for faster logins next time",
    pinConfirm: "Confirm PIN",
    pinMismatch: "PINs do not match",
    finish: "Finish setup",
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    openNow: "Open now",
    closed: "Closed",
    todayOrders: "Today's orders",
    todaySales: "Today's sales",
    rating: "Rating",
    liveOrders: "Live orders",
    noOrders: "No orders yet",
    noOrdersSub: "New orders from customers will appear here. Keep your shop open to receive them.",
    refresh: "Refresh",
    home: "Home",
    orders: "Orders",
    catalogue: "Catalogue",
    profile: "Profile",
    menu: "Menu",
    inventory: "Inventory",
    reports: "Reports",
    payouts: "Payouts",
    settings: "Settings",
    support: "Help & support",
    logout: "Log out",
    comingSoon: "Coming soon",
    language: "Language",
    shopStatus: "Shop status",
    account: "Account",
    verified: "Verified merchant",
    ordersEmpty: "Your order history will show up here once you start receiving orders.",
    catalogueEmpty: "Add your products and services to start selling on badiyos.",
  },
  mr: {
    tagline: "व्यापारी पोर्टल",
    subTagline: "लातूरमध्ये तुमचे दुकान वाढवा",
    loginTitle: "तुमच्या दुकानात प्रवेश करा",
    loginSub: "आम्ही व्हॉट्सअॅपवर OTP पाठवू",
    mobile: "मोबाइल नंबर",
    sendOtp: "व्हॉट्सअॅपवर OTP पाठवा",
    otpTitle: "OTP टाका",
    otpSub: "व्हॉट्सअॅपवर पाठवलेला 6 अंकी कोड",
    resend: "कोड पुन्हा पाठवा",
    verify: "पडताळणी करा",
    changeNumber: "नंबर बदला",
    pinTitle: "4 अंकी पिन सेट करा",
    pinSub: "पुढच्या वेळी लवकर लॉगिन करण्यासाठी वापरा",
    pinConfirm: "पिनची खात्री करा",
    pinMismatch: "पिन जुळत नाही",
    finish: "सेटअप पूर्ण करा",
    greetingMorning: "सुप्रभात",
    greetingAfternoon: "नमस्कार",
    greetingEvening: "शुभ संध्याकाळ",
    openNow: "दुकान चालू",
    closed: "बंद",
    todayOrders: "आजच्या ऑर्डर",
    todaySales: "आजची विक्री",
    rating: "रेटिंग",
    liveOrders: "चालू ऑर्डर",
    noOrders: "अजून ऑर्डर नाहीत",
    noOrdersSub: "ग्राहकांच्या नवीन ऑर्डर येथे दिसतील. ऑर्डर मिळवण्यासाठी दुकान चालू ठेवा.",
    refresh: "रिफ्रेश",
    home: "मुख्यपृष्ठ",
    orders: "ऑर्डर",
    catalogue: "कॅटलॉग",
    profile: "प्रोफाइल",
    menu: "मेनू",
    inventory: "इन्व्हेंटरी",
    reports: "अहवाल",
    payouts: "पेमेंट",
    settings: "सेटिंग्ज",
    support: "मदत व सपोर्ट",
    logout: "बाहेर पडा",
    comingSoon: "लवकरच येत आहे",
    language: "भाषा",
    shopStatus: "दुकानाची स्थिती",
    account: "खाते",
    verified: "पडताळणी झालेला व्यापारी",
    ordersEmpty: "ऑर्डर मिळू लागल्यावर तुमचा ऑर्डर इतिहास येथे दिसेल.",
    catalogueEmpty: "badiyos वर विक्री सुरू करण्यासाठी तुमची उत्पादने व सेवा जोडा.",
  },
} as const;

export type Key = keyof (typeof dict)["en"];

const I18nContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key) => string;
}>({ lang: "en", setLang: () => {}, t: (k) => dict.en[k] });

const STORAGE_KEY = "badiyos.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "mr" || stored === "en") setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback((k: Key) => dict[lang][k] ?? dict.en[k], [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}