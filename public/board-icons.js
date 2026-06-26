/**
 * Board icon library — stroke-style SVG paths (24×24 viewBox).
 * Loaded before board_vanilla.js; exposed as window.BOARD_ICON_LIBRARY.
 */
(function () {
  const categories = [
    { id: 'all', label: 'All' },
    { id: 'general', label: 'General' },
    { id: 'business', label: 'Business' },
    { id: 'technology', label: 'Technology' },
    { id: 'education', label: 'Education' },
    { id: 'healthcare', label: 'Healthcare' },
    { id: 'finance', label: 'Finance' },
    { id: 'communication', label: 'Communication' },
    { id: 'people', label: 'People' },
    { id: 'travel', label: 'Travel' },
    { id: 'creative', label: 'Creative' },
    { id: 'nature', label: 'Nature' },
    { id: 'security', label: 'Security' },
    { id: 'food', label: 'Food' },
    { id: 'sports', label: 'Sports' },
    { id: 'symbols', label: 'Symbols' },
  ];

  /** @type {{ id: string, cat: string, label: string, parts: string[], fill?: boolean }[]} */
  const icons = [
    // ── General ──
    { id: 'home', cat: 'general', label: 'Home', parts: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'] },
    { id: 'search', cat: 'general', label: 'Search', parts: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'] },
    { id: 'settings', cat: 'general', label: 'Settings', parts: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'] },
    { id: 'bell', cat: 'general', label: 'Bell', parts: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'] },
    { id: 'bookmark', cat: 'general', label: 'Bookmark', parts: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'] },
    { id: 'flag', cat: 'general', label: 'Flag', parts: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'] },
    { id: 'star', cat: 'general', label: 'Star', parts: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'], fill: true },
    { id: 'heart', cat: 'general', label: 'Heart', parts: ['M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'] },
    { id: 'calendar', cat: 'general', label: 'Calendar', parts: ['M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'] },
    { id: 'clock', cat: 'general', label: 'Clock', parts: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 6v6l4 2'] },
    { id: 'map-pin', cat: 'general', label: 'Map pin', parts: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'] },
    { id: 'check-circle', cat: 'general', label: 'Check', parts: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4L12 14.01l-3-3'] },
    { id: 'x-circle', cat: 'general', label: 'Close', parts: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M15 9l-6 6', 'M9 9l6 6'] },
    { id: 'plus-circle', cat: 'general', label: 'Add', parts: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 8v8', 'M8 12h8'] },
    { id: 'info', cat: 'general', label: 'Info', parts: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 16v-4', 'M12 8h.01'] },

    // ── Business ──
    { id: 'briefcase', cat: 'business', label: 'Briefcase', parts: ['M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z', 'M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2'] },
    { id: 'building', cat: 'business', label: 'Building', parts: ['M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18', 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2', 'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2', 'M10 6h4', 'M10 10h4', 'M10 14h4', 'M10 18h4'] },
    { id: 'chart-bar', cat: 'business', label: 'Bar chart', parts: ['M12 20V10', 'M18 20V4', 'M6 20v-4'] },
    { id: 'chart-line', cat: 'business', label: 'Line chart', parts: ['M3 3v18h18', 'M18 17l-5-5-4 4-3-3'] },
    { id: 'target', cat: 'business', label: 'Target', parts: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z', 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'] },
    { id: 'presentation', cat: 'business', label: 'Presentation', parts: ['M2 3h20', 'M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3', 'M7 21h10', 'M12 16v5'] },
    { id: 'clipboard', cat: 'business', label: 'Clipboard', parts: ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M15 2H9a1 1 0 0 0-1 1v2h8V3a1 1 0 0 0-1-1z'] },
    { id: 'award', cat: 'business', label: 'Award', parts: ['M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M8.21 13.89L7 23l5-3 5 3-1.21-9.12'] },
    { id: 'trending-up', cat: 'business', label: 'Trending up', parts: ['M23 6l-9.5 9.5-5-5L1 18', 'M17 6h6v6'] },
    { id: 'pie-chart', cat: 'business', label: 'Pie chart', parts: ['M21.21 15.89A10 10 0 1 1 8 2.83', 'M22 12A10 10 0 0 0 12 2v10z'] },
    { id: 'handshake', cat: 'business', label: 'Handshake', parts: ['M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14', 'M7 18h1a2 2 0 0 0 2-2v-2', 'M11 12h2', 'M17 12h1a2 2 0 0 1 2 2v2', 'M21 14l-3-3.6a2 2 0 0 0-1.4-.6h-3'] },
    { id: 'kanban', cat: 'business', label: 'Kanban', parts: ['M6 5v11', 'M12 5v6', 'M18 5v14'] },

    // ── Technology ──
    { id: 'laptop', cat: 'technology', label: 'Laptop', parts: ['M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9', 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z'] },
    { id: 'monitor', cat: 'technology', label: 'Monitor', parts: ['M8 21h8', 'M12 17v4', 'M17 3H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z'] },
    { id: 'smartphone', cat: 'technology', label: 'Phone', parts: ['M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z', 'M12 18h.01'] },
    { id: 'code', cat: 'technology', label: 'Code', parts: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'] },
    { id: 'terminal', cat: 'technology', label: 'Terminal', parts: ['M4 17l6-6-6-6', 'M12 19h8'] },
    { id: 'cloud', cat: 'technology', label: 'Cloud', parts: ['M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z'] },
    { id: 'database', cat: 'technology', label: 'Database', parts: ['M12 2C8 2 4 3 4 6v12c0 3 4 4 8 4s8-1 8-4V6c0-3-4-4-8-4z', 'M4 6c0 3 4 4 8 4s8-1 8-4', 'M4 12c0 3 4 4 8 4s8-1 8-4'] },
    { id: 'cpu', cat: 'technology', label: 'CPU', parts: ['M6 6h12v12H6z', 'M9 2v2', 'M15 2v2', 'M9 20v2', 'M15 20v2', 'M2 9h2', 'M2 15h2', 'M20 9h2', 'M20 15h2'] },
    { id: 'wifi', cat: 'technology', label: 'WiFi', parts: ['M5 12.55a11 11 0 0 1 14.08 0', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01', 'M2 8.82a15 15 0 0 1 20 0'] },
    { id: 'server', cat: 'technology', label: 'Server', parts: ['M22 12H2', 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z', 'M6 16h.01', 'M10 16h.01'] },
    { id: 'git-branch', cat: 'technology', label: 'Git branch', parts: ['M6 3v12', 'M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 6a9 9 0 0 1-9 9'] },
    { id: 'bug', cat: 'technology', label: 'Bug', parts: ['M8 2v2', 'M16 2v2', 'M12 2v2', 'M8 22v-2', 'M16 22v-2', 'M12 22v-2', 'M4 12H2', 'M22 12h-2', 'M8 6h8a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z'] },

    // ── Education ──
    { id: 'book', cat: 'education', label: 'Book', parts: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'] },
    { id: 'graduation-cap', cat: 'education', label: 'Graduation', parts: ['M22 10v6M2 10l10-5 10 5-10 5z', 'M6 12v5c0 2 3 3 6 3s6-1 6-3v-5'] },
    { id: 'lightbulb', cat: 'education', label: 'Idea', parts: ['M9 18h6', 'M10 22h4', 'M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14'] },
    { id: 'pencil', cat: 'education', label: 'Pencil', parts: ['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z', 'M15 5l4 4'] },
    { id: 'notebook', cat: 'education', label: 'Notebook', parts: ['M2 6h4', 'M2 10h4', 'M2 14h4', 'M2 18h4', 'M20 6H8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12V6z'] },
    { id: 'microscope', cat: 'education', label: 'Science', parts: ['M6 18h8', 'M3 22h18', 'M14 22a7 7 0 1 0 0-14h-1', 'M9 14h2', 'M12 2v2', 'M4 2v2'] },
    { id: 'brain', cat: 'education', label: 'Brain', parts: ['M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54', 'M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54'] },
    { id: 'library', cat: 'education', label: 'Library', parts: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15z', 'M9 6h6', 'M9 10h6'] },
    { id: 'globe', cat: 'education', label: 'Globe', parts: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'] },
    { id: 'calculator', cat: 'education', label: 'Calculator', parts: ['M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M8 6h8', 'M8 10h.01', 'M12 10h.01', 'M16 10h.01', 'M8 14h.01', 'M12 14h.01', 'M16 14h.01', 'M8 18h.01', 'M12 18h.01', 'M16 18h.01'] },

    // ── Healthcare ──
    { id: 'heart-pulse', cat: 'healthcare', label: 'Heart pulse', parts: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z', 'M3 13h4l1.5-3 2 6 2-4 1.5 1H21'] },
    { id: 'pill', cat: 'healthcare', label: 'Pill', parts: ['M10.5 20.5L3 13l7.5-7.5 7.5 7.5-7.5 7.5z', 'M14 10l4 4'] },
    { id: 'stethoscope', cat: 'healthcare', label: 'Stethoscope', parts: ['M4.8 2.3A6 6 0 0 0 2 8v10a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-4', 'M9 12h4', 'M16 4a2 2 0 0 1 2 2v2a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6V6a2 2 0 0 1 2-2z', 'M20 10v2a4 4 0 0 1-4 4'] },
    { id: 'hospital', cat: 'healthcare', label: 'Hospital', parts: ['M12 6v4', 'M10 8h4', 'M3 21h18', 'M5 21V7l8-4v18', 'M19 21V11l-6-4'] },
    { id: 'activity', cat: 'healthcare', label: 'Activity', parts: ['M22 12h-4l-3 9L9 3l-3 9H2'] },
    { id: 'syringe', cat: 'healthcare', label: 'Syringe', parts: ['M18 2l4 4', 'M17 7l-10 10', 'M8 18l-4 4', 'M2 22l4-4', 'M15 9l-6 6'] },
    { id: 'shield-plus', cat: 'healthcare', label: 'Health shield', parts: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M12 8v8', 'M8 12h8'] },
    { id: 'thermometer', cat: 'healthcare', label: 'Thermometer', parts: ['M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z'] },

    // ── Finance ──
    { id: 'dollar', cat: 'finance', label: 'Dollar', parts: ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'] },
    { id: 'credit-card', cat: 'finance', label: 'Credit card', parts: ['M22 10H2', 'M22 6H2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z', 'M6 16h.01', 'M10 16h4'] },
    { id: 'wallet', cat: 'finance', label: 'Wallet', parts: ['M21 12V7H5a2 2 0 0 1 0-4h14v4', 'M3 5v14a2 2 0 0 0 2 2h16v-5', 'M18 12a2 2 0 0 0 0 4h4v-4Z'] },
    { id: 'coins', cat: 'finance', label: 'Coins', parts: ['M8 6h8', 'M6 10h12', 'M4 14h16', 'M2 18h20'] },
    { id: 'piggy-bank', cat: 'finance', label: 'Savings', parts: ['M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2z', 'M9 11h.01', 'M15 11h.01'] },
    { id: 'receipt', cat: 'finance', label: 'Receipt', parts: ['M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z', 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 0 1 0 4H8', 'M12 17.5v-11'] },
    { id: 'banknote', cat: 'finance', label: 'Banknote', parts: ['M2 6h20v12H2z', 'M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M6 10h.01', 'M18 10h.01'] },
    { id: 'percent', cat: 'finance', label: 'Percent', parts: ['M19 5L5 19', 'M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'] },
    { id: 'scale', cat: 'finance', label: 'Balance', parts: ['M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z', 'M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z', 'M7 21h10', 'M12 3v18'] },
    { id: 'trending-down', cat: 'finance', label: 'Trending down', parts: ['M23 18l-9.5-9.5-5 5L1 6', 'M17 18h6v-6'] },

    // ── Communication ──
    { id: 'mail', cat: 'communication', label: 'Mail', parts: ['M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z', 'M22 6l-10 7L2 6'] },
    { id: 'message', cat: 'communication', label: 'Message', parts: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'] },
    { id: 'phone', cat: 'communication', label: 'Phone call', parts: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z'] },
    { id: 'video', cat: 'communication', label: 'Video', parts: ['M23 7l-7 5 7 5V7z', 'M14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z'] },
    { id: 'megaphone', cat: 'communication', label: 'Megaphone', parts: ['M3 11l18-5v12L3 13v-2z', 'M11 13v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5'] },
    { id: 'share', cat: 'communication', label: 'Share', parts: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'] },
    { id: 'send', cat: 'communication', label: 'Send', parts: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'] },
    { id: 'at-sign', cat: 'communication', label: 'At sign', parts: ['M16 8a6 6 0 1 0-8 5.2', 'M12 16v4', 'M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'] },
    { id: 'rss', cat: 'communication', label: 'RSS', parts: ['M4 11a9 9 0 0 1 9 9', 'M4 4a16 16 0 0 1 16 16', 'M5 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'] },
    { id: 'headphones', cat: 'communication', label: 'Headphones', parts: ['M3 18v-6a9 9 0 0 1 18 0v6', 'M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z', 'M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z'] },

    // ── People ──
    { id: 'user', cat: 'people', label: 'User', parts: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'] },
    { id: 'users', cat: 'people', label: 'Team', parts: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'] },
    { id: 'user-plus', cat: 'people', label: 'Add user', parts: ['M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M20 8v6', 'M23 11h-6'] },
    { id: 'smile', cat: 'people', label: 'Smile', parts: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M8 14s1.5 2 4 2 4-2 4-2', 'M9 9h.01', 'M15 9h.01'] },
    { id: 'thumbs-up', cat: 'people', label: 'Thumbs up', parts: ['M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z', 'M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3'] },
    { id: 'thumbs-down', cat: 'people', label: 'Thumbs down', parts: ['M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z', 'M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17'] },
    { id: 'user-check', cat: 'people', label: 'Verified user', parts: ['M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M17 11l2 2 4-4'] },
    { id: 'accessibility', cat: 'people', label: 'Accessibility', parts: ['M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', 'M4 7h16', 'M9 7v10l-2 5', 'M15 7v10l2 5', 'M7 12h10'] },

    // ── Travel ──
    { id: 'plane', cat: 'travel', label: 'Plane', parts: ['M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'] },
    { id: 'car', cat: 'travel', label: 'Car', parts: ['M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2', 'M7 17h10', 'M5 11h14', 'M7 15h.01', 'M17 15h.01'] },
    { id: 'train', cat: 'travel', label: 'Train', parts: ['M4 15h16', 'M4 18h16', 'M4 11h16V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z', 'M8 15h.01', 'M16 15h.01', 'M8 3v2', 'M16 3v2'] },
    { id: 'ship', cat: 'travel', label: 'Ship', parts: ['M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.5 0 2.5 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1', 'M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76', 'M12 2v8'] },
    { id: 'map', cat: 'travel', label: 'Map', parts: ['M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z', 'M8 2v16', 'M16 6v16'] },
    { id: 'compass', cat: 'travel', label: 'Compass', parts: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z'] },
    { id: 'luggage', cat: 'travel', label: 'Luggage', parts: ['M6 20h12', 'M8 20V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12', 'M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2'] },
    { id: 'fuel', cat: 'travel', label: 'Fuel', parts: ['M3 22h12', 'M5 22V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v16', 'M19 10V4a2 2 0 0 0-2-2h-1', 'M19 14v8', 'M19 22h2'] },

    // ── Creative ──
    { id: 'palette', cat: 'creative', label: 'Palette', parts: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M16 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M8 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'] },
    { id: 'brush', cat: 'creative', label: 'Brush', parts: ['M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08', 'M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z'] },
    { id: 'camera', cat: 'creative', label: 'Camera', parts: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'] },
    { id: 'music', cat: 'creative', label: 'Music', parts: ['M9 18V5l12-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'] },
    { id: 'film', cat: 'creative', label: 'Film', parts: ['M2 6h20v12H2z', 'M2 10h20', 'M7 6v4', 'M7 14v4', 'M17 6v4', 'M17 14v4'] },
    { id: 'scissors', cat: 'creative', label: 'Scissors', parts: ['M6 6l12 12', 'M6 18L18 6', 'M20 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'M4 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'] },
    { id: 'pen-tool', cat: 'creative', label: 'Pen tool', parts: ['M12 19l7-7 3 3-7 7-3-3z', 'M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z', 'M2 2l7.586 7.586'] },
    { id: 'layers', cat: 'creative', label: 'Layers', parts: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'] },

    // ── Nature ──
    { id: 'sun', cat: 'nature', label: 'Sun', parts: ['M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M6.34 17.66l-1.41 1.41', 'M19.07 4.93l-1.41 1.41', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'] },
    { id: 'moon', cat: 'nature', label: 'Moon', parts: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'] },
    { id: 'cloud-rain', cat: 'nature', label: 'Rain', parts: ['M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A6 6 0 0 0 2 12.6', 'M8 19v2', 'M12 19v2', 'M16 19v2'] },
    { id: 'leaf', cat: 'nature', label: 'Leaf', parts: ['M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z', 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12'] },
    { id: 'tree', cat: 'nature', label: 'Tree', parts: ['M12 22v-7', 'M8 22h8', 'M12 15a5 5 0 0 0 5-5c0-2-1-3.5-2.5-4.5A3 3 0 0 0 12 4a3 3 0 0 0-2.5 1.5C8 6.5 7 8 7 10a5 5 0 0 0 5 5z'] },
    { id: 'flower', cat: 'nature', label: 'Flower', parts: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-2.7-5.3A7 7 0 0 0 12 4a7 7 0 0 0-4.3 5.7A7 7 0 0 0 5 15a7 7 0 0 0 7 7z', 'M12 22v-7'] },
    { id: 'droplet', cat: 'nature', label: 'Water', parts: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-2.7-5.3A7 7 0 0 0 12 2a7 7 0 0 0-4.3 5.7A7 7 0 0 0 5 15a7 7 0 0 0 7 7z'] },
    { id: 'wind', cat: 'nature', label: 'Wind', parts: ['M9.59 4.59A2 2 0 1 1 11 8H2', 'M12.59 19.41A2 2 0 1 0 14 16H2', 'M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2'] },

    // ── Security ──
    { id: 'lock', cat: 'security', label: 'Lock', parts: ['M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'] },
    { id: 'unlock', cat: 'security', label: 'Unlock', parts: ['M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z', 'M7 11V7a5 5 0 0 1 9.9-1'] },
    { id: 'key', cat: 'security', label: 'Key', parts: ['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'] },
    { id: 'shield', cat: 'security', label: 'Shield', parts: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'] },
    { id: 'eye', cat: 'security', label: 'Eye', parts: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'] },
    { id: 'fingerprint', cat: 'security', label: 'Fingerprint', parts: ['M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4', 'M5 19.5A9 9 0 0 1 3.07 15', 'M17 19.5A9 9 0 0 0 21 12', 'M12 22v-4', 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M12 6V2'] },

    // ── Food ──
    { id: 'coffee', cat: 'food', label: 'Coffee', parts: ['M18 8h1a4 4 0 0 1 0 8h-1', 'M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z', 'M6 1v3', 'M10 1v3', 'M14 1v3'] },
    { id: 'utensils', cat: 'food', label: 'Utensils', parts: ['M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v8', 'M21 15v7'] },
    { id: 'apple', cat: 'food', label: 'Apple', parts: ['M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-3 6-6 0-2-1-3.9-2.7-5.3A7 7 0 0 0 12 4a7 7 0 0 0-7.3 6.7C3 12.1 2 14 2 16c0 3 3 6 6 6 1.25 0 2.5-1.06 4-1.06z', 'M12 4V2'] },
    { id: 'pizza', cat: 'food', label: 'Pizza', parts: ['M15 11h.01', 'M11 15h.01', 'M16 16h.01', 'M2 16l20-6-6-20-20 6z'] },
    { id: 'cake', cat: 'food', label: 'Cake', parts: ['M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8', 'M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1', 'M2 21h20', 'M7 8v3', 'M12 8v3', 'M17 8v3', 'M7 4h.01', 'M12 4h.01', 'M17 4h.01'] },
    { id: 'wine', cat: 'food', label: 'Wine', parts: ['M8 22h8', 'M12 15v7', 'M7 2h10l1 8a5 5 0 0 1-10 0z'] },

    // ── Sports ──
    { id: 'trophy', cat: 'sports', label: 'Trophy', parts: ['M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2z'] },
    { id: 'medal', cat: 'sports', label: 'Medal', parts: ['M7.21 15 2.66 7.14a2 2 0 0 1 1.11-2.94l3.22-1.05a2 2 0 0 1 2.53 1.31L12 10.5', 'M16.79 15 21.34 7.14a2 2 0 0 0-1.11-2.94l-3.22-1.05a2 2 0 0 0-2.53 1.31L12 10.5', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'] },
    { id: 'dumbbell', cat: 'sports', label: 'Dumbbell', parts: ['M6.5 6.5h11', 'M6.5 17.5h11', 'M3 12h3', 'M18 12h3', 'M3 8v8', 'M21 8v8', 'M6 8v8', 'M18 8v8'] },
    { id: 'bike', cat: 'sports', label: 'Bike', parts: ['M5.5 17.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z', 'M18.5 17.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z', 'M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M12 17.5V14l-3-3 4-3 2 3h2'] },
    { id: 'timer', cat: 'sports', label: 'Timer', parts: ['M10 2h4', 'M12 14v-4', 'M4 13a8 8 0 0 1 8-7 8 8 0 1 1-5.3 14.3', 'M9 17H5v4'] },

    // ── Symbols ──
    { id: 'arrow-right', cat: 'symbols', label: 'Arrow right', parts: ['M5 12h14', 'M12 5l7 7-7 7'] },
    { id: 'arrow-left', cat: 'symbols', label: 'Arrow left', parts: ['M19 12H5', 'M12 19l-7-7 7-7'] },
    { id: 'arrow-up', cat: 'symbols', label: 'Arrow up', parts: ['M12 19V5', 'M5 12l7-7 7 7'] },
    { id: 'arrow-down', cat: 'symbols', label: 'Arrow down', parts: ['M12 5v14', 'M19 12l-7 7-7-7'] },
    { id: 'refresh', cat: 'symbols', label: 'Refresh', parts: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'] },
    { id: 'link', cat: 'symbols', label: 'Link', parts: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'] },
    { id: 'zap', cat: 'symbols', label: 'Lightning', parts: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'] },
    { id: 'infinity', cat: 'symbols', label: 'Infinity', parts: ['M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4zm0 0c2 2.67 4 4 6 4a4 4 0 1 0 0-8c-2 0-4 1.33-6 4z'] },
    { id: 'hash', cat: 'symbols', label: 'Hash', parts: ['M4 9h16', 'M4 15h16', 'M10 3L8 21', 'M16 3l-2 18'] },
    { id: 'alert', cat: 'symbols', label: 'Alert', parts: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'] },
    { id: 'help', cat: 'symbols', label: 'Help', parts: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'] },
    { id: 'sparkles', cat: 'symbols', label: 'Sparkles', parts: ['M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z', 'M19 3v2', 'M19 19v2', 'M5 3v2', 'M5 19v2'] },
  ];

  window.BOARD_ICON_LIBRARY = { categories, icons };
  window.__LPA_BOARD_ICONS_LOADED__ = true;
})();
