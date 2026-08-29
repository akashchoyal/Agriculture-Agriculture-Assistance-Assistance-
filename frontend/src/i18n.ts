export type Language = "hi" | "en";

export const copy = {
  en: {
    appName: "KrishiAI", tagline: "Your field. Smarter.", welcome: "Good morning", farmer: "Farmer",
    home: "Home", scan: "Scan", chat: "Ask AI", profile: "Profile", settings: "Settings", logout: "Log out",
    myField: "My field", fieldStatus: "Field looks healthy", moisture: "Soil moisture", humidity: "Humidity", temperature: "Temperature",
    quickActions: "Quick actions", scanCrop: "Scan crop", askExpert: "Ask expert", weather: "Weather", market: "Market",
    recentHealth: "Recent crop health", healthy: "Healthy", viewAll: "View all", fieldTip: "Field tip", tip: "Water early morning to reduce evaporation.",
    login: "Log in", signup: "Create account", email: "Email address", password: "Password", fullName: "Your name", continueGoogle: "Continue with Google",
    noAccount: "New to KrishiAI?", haveAccount: "Already have an account?", language: "Language", theme: "Appearance", light: "Light", dark: "Dark",
    scanTitle: "Crop scanner", scanSubtitle: "Spot problems before they spread", takePhoto: "Take a photo", choosePhoto: "Choose from gallery", scanNow: "Analyze crop", retake: "Scan another crop",
    diagnosis: "AI diagnosis", confidence: "Confidence", symptoms: "What we noticed", remedies: "What to do next", scanDisclaimer: "AI guidance is a starting point. Confirm serious issues with a local agronomist.",
    chatTitle: "Ask KrishiAI", chatSubtitle: "Practical advice for your farm", messagePlaceholder: "Ask about your crop...", send: "Send", suggestions: ["How do I cure tomato blight?", "Best fertilizer for wheat", "Why are my leaves yellow?"],
    profileTitle: "Your profile", editProfile: "Edit profile", age: "Age", pincode: "Pincode", country: "Country", address: "Farm address", save: "Save changes", saved: "Profile saved", photo: "Profile photo", complete: "Complete your farm profile",
    preferences: "Preferences", notifications: "Notifications", help: "Help & support", about: "About KrishiAI", account: "Account", chooseLanguage: "Choose language", chooseTheme: "Choose theme", cancel: "Cancel", done: "Done",
    required: "Please fill in the required fields", loading: "Preparing your farm dashboard...", retry: "Try again", empty: "No crop scans yet", scanEmpty: "Take a clear photo of a leaf or crop to begin.", signOut: "Sign out",
  },
  hi: {
    appName: "KrishiAI", tagline: "आपका खेत। और समझदार।", welcome: "सुप्रभात", farmer: "किसान",
    home: "होम", scan: "स्कैन", chat: "AI से पूछें", profile: "प्रोफ़ाइल", settings: "सेटिंग्स", logout: "लॉग आउट",
    myField: "मेरा खेत", fieldStatus: "खेत स्वस्थ दिख रहा है", moisture: "मिट्टी की नमी", humidity: "नमी", temperature: "तापमान",
    quickActions: "त्वरित काम", scanCrop: "फसल स्कैन", askExpert: "विशेषज्ञ से पूछें", weather: "मौसम", market: "बाज़ार",
    recentHealth: "हाल की फसल स्थिति", healthy: "स्वस्थ", viewAll: "सब देखें", fieldTip: "खेत की सलाह", tip: "वाष्पीकरण कम करने के लिए सुबह जल्दी पानी दें।",
    login: "लॉग इन", signup: "नया खाता", email: "ईमेल पता", password: "पासवर्ड", fullName: "आपका नाम", continueGoogle: "Google से जारी रखें",
    noAccount: "KrishiAI पर नए हैं?", haveAccount: "पहले से खाता है?", language: "भाषा", theme: "रूप", light: "लाइट", dark: "डार्क",
    scanTitle: "फसल स्कैनर", scanSubtitle: "समस्या फैलने से पहले पहचानें", takePhoto: "फोटो लें", choosePhoto: "गैलरी से चुनें", scanNow: "फसल का विश्लेषण", retake: "दूसरी फसल स्कैन करें",
    diagnosis: "AI जांच", confidence: "विश्वास स्तर", symptoms: "हमें यह दिखा", remedies: "अब क्या करें", scanDisclaimer: "AI सलाह शुरुआत के लिए है। गंभीर समस्या में स्थानीय कृषि विशेषज्ञ से मिलें।",
    chatTitle: "KrishiAI से पूछें", chatSubtitle: "आपके खेत के लिए उपयोगी सलाह", messagePlaceholder: "अपनी फसल के बारे में पूछें...", send: "भेजें", suggestions: ["टमाटर का झुलसा रोग कैसे ठीक करें?", "गेहूं के लिए अच्छा खाद", "पत्तियां पीली क्यों हो रही हैं?"],
    profileTitle: "आपकी प्रोफ़ाइल", editProfile: "प्रोफ़ाइल बदलें", age: "उम्र", pincode: "पिन कोड", country: "देश", address: "खेत का पता", save: "बदलाव सहेजें", saved: "प्रोफ़ाइल सेव हो गई", photo: "प्रोफ़ाइल फोटो", complete: "अपनी कृषि प्रोफ़ाइल पूरी करें",
    preferences: "पसंद", notifications: "नोटिफिकेशन", help: "मदद और सहायता", about: "KrishiAI के बारे में", account: "खाता", chooseLanguage: "भाषा चुनें", chooseTheme: "रूप चुनें", cancel: "रद्द करें", done: "हो गया",
    required: "कृपया जरूरी जानकारी भरें", loading: "आपका खेत तैयार हो रहा है...", retry: "फिर कोशिश करें", empty: "अभी कोई स्कैन नहीं", scanEmpty: "शुरू करने के लिए पत्ती या फसल की साफ फोटो लें।", signOut: "साइन आउट",
  },
} as const;

export type Copy = { [K in keyof typeof copy.en]: typeof copy.en[K] extends readonly string[] ? readonly string[] : string };