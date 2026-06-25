import { loadPrefs } from "./prefs";

type Lang = "en" | "pl";

const translations: Record<string, Record<Lang, string>> = {
  // ── Navigation ──
  "nav.home":        { en: "Home",       pl: "Główna"      },
  "nav.dashboard":   { en: "Dashboard",  pl: "Pulpit"      },
  "nav.categories":  { en: "Categories", pl: "Kategorie"   },
  "nav.goals":       { en: "Goals",      pl: "Cele"        },
  "nav.household":   { en: "Household",  pl: "Gospodarstwo"},
  "nav.alerts":      { en: "Alerts",     pl: "Alerty"      },

  // ── Layout / Profile ──
  "profile.preferences": { en: "Preferences",  pl: "Preferencje"   },
  "profile.currency":    { en: "Currency",      pl: "Waluta"        },
  "profile.language":    { en: "Language",      pl: "Język"         },
  "profile.sign_out":    { en: "Sign out",      pl: "Wyloguj"       },
  "profile.signing_out": { en: "Signing out…",  pl: "Wylogowywanie…"},
  "profile.converting":  { en: "Converting…",   pl: "Przeliczanie…" },

  // ── Common ──
  "common.cancel":      { en: "Cancel",     pl: "Anuluj"     },
  "common.save":        { en: "Save",       pl: "Zapisz"     },
  "common.saving":      { en: "Saving…",    pl: "Zapisywanie…"},
  "common.delete":      { en: "Delete",     pl: "Usuń"       },
  "common.deleting":    { en: "Deleting…",  pl: "Usuwanie…"  },
  "common.edit":        { en: "Edit",       pl: "Edytuj"     },
  "common.add":         { en: "Add",        pl: "Dodaj"      },
  "common.new":         { en: "New",        pl: "Nowy"       },
  "common.done":        { en: "Done",       pl: "Gotowe"     },
  "common.of":          { en: "of",         pl: "z"          },
  "common.remaining":   { en: "remaining",  pl: "pozostało"  },
  "common.over_budget": { en: "over budget",pl: "przekroczono budżet"},
  "common.uncategorized":{ en: "Uncategorized", pl: "brak kategorii"},
  "common.no_limit":    { en: "No limit",   pl: "Bez limitu" },
  "common.amount":      { en: "Amount",     pl: "Kwota"      },
  "common.name":        { en: "Name",       pl: "Nazwa"      },
  "common.email":       { en: "Email address", pl: "Adres e-mail"},
  "common.date":        { en: "Date",       pl: "Data"       },

  // ── Dashboard ──
  "dashboard.title":          { en: "Dashboard",           pl: "Pulpit"                       },
  "dashboard.this_month":     { en: "this month",          pl: "ten miesiąc"                  },
  "dashboard.total_spent":    { en: "Total spent",         pl: "Łącznie wydano"               },
  "dashboard.budget":         { en: "Budget",              pl: "Budżet"                       },
  "dashboard.transactions":   { en: "Transactions",        pl: "Transakcje"                   },
  "dashboard.for_goals":      { en: "For goals",           pl: "Na cele"                      },
  "dashboard.no_budgets":     { en: "no budgets set",      pl: "brak budżetów"                },
  "dashboard.no_contributions":{ en: "no contributions",   pl: "brak wpłat"                   },
  "dashboard.goals_active":   { en: "{n} goal{s} active",  pl: "{n} cel{s} aktywny{pl}"      },
  "dashboard.by_category":    { en: "Spending by Category",pl: "Wydatki wg kategorii"         },
  "dashboard.goals_progress": { en: "Goals Progress",      pl: "Postęp celów"                 },
  "dashboard.monthly_trend":  { en: "Monthly Trend",       pl: "Trend miesięczny"             },
  "dashboard.no_spending":    { en: "No spending data yet",pl: "Brak danych o wydatkach"      },
  "dashboard.no_recent":      { en: "No recent transactions.", pl: "Brak ostatnich transakcji."},
  "dashboard.no_history":     { en: "No spending history yet.", pl: "Brak historii wydatków." },
  "dashboard.recent_activity":{ en: "Recent Activity",     pl: "Ostatnia aktywność"           },
  "dashboard.view_all":       { en: "View all",            pl: "Pokaż wszystkie"              },
  "dashboard.spending_history":{ en: "Spending History",   pl: "Historia wydatków"            },
  "dashboard.tx":             { en: "tx",                  pl: "transakcje"                   },
  "dashboard.over":           { en: "Over",                pl: "Przekroczono"                 },

  // ── Home / Spending ──
  "home.search_placeholder":  { en: "Search by name, category, amount or date…", pl: "Szukaj po nazwie, kategorii, kwocie lub dacie…"},
  "home.search_no_results":   { en: "No transactions match your search.", pl: "Brak transakcji pasujących do wyszukiwania."},
  "home.set_budget":          { en: "Set your total monthly budget",     pl: "Ustaw miesięczny budżet"         },
  "home.track_how_close":     { en: "Track how close you are to your limit", pl: "Śledź, jak blisko jesteś limitu"},
  "home.monthly_budget":      { en: "Monthly Budget",                    pl: "Miesięczny budżet"               },
  "home.description":         { en: "Description",                       pl: "Opis"                            },
  "home.category":            { en: "Category",                          pl: "Kategoria"                       },
  "home.no_category":         { en: "No category",                       pl: "Bez kategorii"                   },
  "home.payment":             { en: "Payment",                           pl: "Płatność"                        },
  "home.card":                { en: "Card",                              pl: "Karta"                           },
  "home.cash":                { en: "Cash",                              pl: "Gotówka"                         },
  "home.bank_transfer":       { en: "Bank Transfer",                     pl: "Przelew"                         },
  "home.partially_goal":      { en: "Partially a Goal expense",          pl: "Częściowo na cel"                },
  "home.count_toward_goal":   { en: "Count part of this expense toward a goal", pl: "Wlicz część wydatku na cel"},
  "home.goal":                { en: "Goal",                              pl: "Cel"                             },
  "home.select_goal":         { en: "Select a goal",                     pl: "Wybierz cel"                     },
  "home.amount_toward_goal":  { en: "Amount toward goal",                pl: "Kwota na cel"                    },
  "home.up_to":               { en: "up to",                            pl: "do"                              },
  "home.cannot_exceed":       { en: "Cannot exceed transaction amount",  pl: "Nie może przekroczyć kwoty transakcji"},
  "home.no_spending_month":   { en: "No spending logged for this month.",pl: "Brak wydatków w tym miesiącu."  },
  "home.add_first_entry":     { en: "Add first entry",                   pl: "Dodaj pierwszy wpis"             },
  "home.goal_contribution":   { en: "Goal contribution",                 pl: "Wpłata na cel"                   },
  "home.receipt":             { en: "Receipt — {desc}",                  pl: "Paragon — {desc}"                },
  "home.no_receipt":          { en: "No receipt attached yet.",          pl: "Brak paragonu."                  },
  "home.uploading":           { en: "Uploading…",                        pl: "Przesyłanie…"                    },
  "home.camera":              { en: "Camera",                            pl: "Aparat"                          },
  "home.library":             { en: "Library",                           pl: "Galeria"                         },
  "home.view":                { en: "View",                              pl: "Podgląd"                         },
  "home.remove":              { en: "Remove",                            pl: "Usuń"                            },
  "home.edit_budget":         { en: "Edit",                              pl: "Edytuj"                          },
  "home.coffee_placeholder":  { en: "Coffee, groceries…",               pl: "Kawa, zakupy…"                   },

  // ── Transactions ──
  "tx.title":       { en: "Transactions",     pl: "Transakcje"        },
  "tx.search":      { en: "Search…",          pl: "Szukaj…"           },
  "tx.all_cats":    { en: "All categories",   pl: "Wszystkie kategorie"},
  "tx.no_results":  { en: "No results found.",pl: "Brak wyników."     },
  "tx.goals":       { en: "Goals",            pl: "Cele"              },
  "tx.dedicate":    { en: "Dedicate to Goal", pl: "Przypisz do celu"  },
  "tx.choose_goal": { en: "Choose goal…",     pl: "Wybierz cel…"      },
  "tx.grocery_placeholder": { en: "Coffee, groceries...", pl: "Kawa, zakupy..." },
  "tx.goal":            { en: "Goal",                       pl: "Cel"                            },

  // ── Categories ──
  "cat.title":         { en: "Categories",                pl: "Kategorie"                    },
  "cat.subtitle":      { en: "Color-coded spending categories", pl: "Kategorie wydatków z kolorami"},
  "cat.budgets_total": { en: "Category budgets total",    pl: "Suma budżetów kategorii"      },
  "cat.budget":        { en: "Budget:",                   pl: "Budżet:"                      },
  "cat.no_budget":     { en: "No budget",                 pl: "Bez budżetu"                  },
  "cat.no_categories": { en: "No categories yet.",        pl: "Brak kategorii."              },
  "cat.create_first":  { en: "Create first category",     pl: "Utwórz pierwszą kategorię"    },
  "cat.new":           { en: "New Category",              pl: "Nowa kategoria"               },
  "cat.add_btn":       { en: "New",                       pl: "Nowa"                         },
  "cat.edit":          { en: "Edit Category",             pl: "Edytuj kategorię"             },
  "cat.cat_name":      { en: "Category name",             pl: "Nazwa kategorii"              },
  "cat.placeholder":   { en: "Groceries, Coffee, Rent…",  pl: "Zakupy, Kawa, Czynsz…"       },
  "cat.color":         { en: "Color",                     pl: "Kolor"                        },
  "cat.custom_color":  { en: "Custom color",              pl: "Własny kolor"                 },
  "cat.budget_optional":{ en: "Monthly Budget (optional)",pl: "Miesięczny budżet (opcjonalnie)"},
  "cat.percent":       { en: "percent",                   pl: "procent"                      },
  "cat.set_total_first":{ en: "Set your total monthly budget on the Home tab first to use % mode.",
                          pl: "Najpierw ustaw łączny budżet miesięczny na stronie Głównej, aby użyć trybu %." },
  "cat.exceeds":       { en: "Exceeds total monthly budget", pl: "Przekracza łączny budżet miesięczny"},

  // ── Goals ──
  "goals.title":        { en: "Goals",                      pl: "Cele"                           },
  "goals.active":       { en: "Active",                     pl: "Aktywne"                        },
  "goals.past":         { en: "Past",                       pl: "Przeszłe"                       },
  "goals.new":          { en: "New Goal",                   pl: "Nowy cel"                       },
  "goals.target":       { en: "Target:",                    pl: "Cel:"                           },
  "goals.due":          { en: "Due",                        pl: "Termin"                         },
  "goals.saved":        { en: "saved",                      pl: "zaoszczędzono"                  },
  "goals.save_per_mo":  { en: "Save {amt}/mo",              pl: "Oszczędź {amt}/mies."           },
  "goals.months_left":  { en: "month(s) left",              pl: "mies. pozostało"                },
  "goals.no_active":    { en: "No active goals.",           pl: "Brak aktywnych celów."          },
  "goals.create":       { en: "Create a goal",              pl: "Utwórz cel"                     },
  "goals.no_past":      { en: "No past goals.",             pl: "Brak przeszłych celów."         },
  "goals.goal_name":    { en: "Goal name",                  pl: "Nazwa celu"                     },
  "goals.target_amt":   { en: "Target amount",              pl: "Kwota docelowa"                 },
  "goals.deadline":     { en: "Deadline",                   pl: "Termin"                         },
  "goals.divide_mo":    { en: "Divide by months left",      pl: "Podziel przez pozostałe miesiące"},
  "goals.calc_monthly": { en: "Calculate required monthly savings", pl: "Oblicz wymagane miesięczne oszczędności"},
  "goals.visibility":   { en: "Goal Visibility",            pl: "Widoczność celu"                },
  "goals.make_private": { en: "Make Private",               pl: "Ustaw jako prywatny"            },
  "goals.remove_from_household": { en: "Remove from household goals", pl: "Usuń z celów gospodarstwa"},
  "goals.make_household": { en: "Make Household Goal",      pl: "Ustaw jako cel gospodarstwa"   },
  "goals.share_progress": { en: "Share progress with all members", pl: "Udostępnij postęp wszystkim członkom"},
  "goals.proposal_sent": { en: "Proposal sent",             pl: "Propozycja wysłana"             },
  "goals.awaiting_approval": { en: "Already awaiting approval", pl: "Oczekuje na zatwierdzenie" },
  "goals.awaiting_owner":  { en: "Awaiting household owner approval", pl: "Oczekuje na zatwierdzenie właściciela"},
  "goals.propose":      { en: "Propose to Household",       pl: "Zaproponuj gospodarstwu"        },
  "goals.propose_to_hh":{ en: "Propose to Household",      pl: "Zaproponuj gospodarstwu"        },
  "goals.request_owner":{ en: "Request owner to make this a shared goal", pl: "Poproś właściciela o udostępnienie celu"},
  "goals.proposals":    { en: "Goal Proposals",             pl: "Propozycje celów"               },
  "goals.proposed_by":  { en: "Proposed by {name}",          pl: "Zaproponowane przez {name}"     },
  "goals.approve":      { en: "Approve",                    pl: "Zatwierdź"                      },
  "goals.decline":      { en: "Decline",                    pl: "Odrzuć"                         },
  "goals.color":        { en: "Color",                      pl: "Kolor"                          },

  // ── Household ──
  "hh.title":           { en: "Household",                  pl: "Gospodarstwo domowe"            },
  "hh.subtitle":        { en: "Shared spending with your household", pl: "Wspólne wydatki z Twoim gospodarstwem"},
  "hh.no_household":    { en: "No household yet",           pl: "Brak gospodarstwa"              },
  "hh.create_msg":      { en: "Create one to share expenses with family or roommates", pl: "Utwórz, aby dzielić wydatki z rodziną lub współlokatorami"},
  "hh.create":          { en: "Create Household",           pl: "Utwórz gospodarstwo"            },
  "hh.since":           { en: "Since",                      pl: "Od"                             },
  "hh.delete":          { en: "Delete",                     pl: "Usuń"                           },
  "hh.leave":           { en: "Leave",                      pl: "Opuść"                          },
  "hh.leave_confirm":   { en: "Leave this household?",      pl: "Opuścić to gospodarstwo?"       },
  "hh.edit_budget":     { en: "Edit budget",                pl: "Edytuj budżet"                  },
  "hh.set_budget":      { en: "Set monthly budget",         pl: "Ustaw miesięczny budżet"        },
  "hh.members":         { en: "Members",                    pl: "Członkowie"                     },
  "hh.invite":          { en: "Invite",                     pl: "Zaproś"                         },
  "hh.you":             { en: "you",                        pl: "ty"                             },
  "hh.dash_private":    { en: "Dashboard private",          pl: "Dashboard prywatny"             },
  "hh.remove_confirm":  { en: "Remove {name} from the household?", pl: "Usunąć {name} z gospodarstwa?"},
  "hh.member_private":  { en: "This member has made their dashboard private.", pl: "Ten członek ustawił swój dashboard jako prywatny."},
  "hh.dash_is_private": { en: "Dashboard is private.",      pl: "Dashboard jest prywatny."       },
  "hh.no_spending":     { en: "No spending this month.",    pl: "Brak wydatków w tym miesiącu."  },
  "hh.shared_goals":    { en: "Shared Goals",               pl: "Wspólne cele"                   },
  "hh.goal_reached":    { en: "Goal reached! 🎉",           pl: "Cel osiągnięty! 🎉"             },
  "hh.combined":        { en: "saved — combined household progress this month",
                           pl: "zaoszczędzono — łączny postęp gospodarstwa w tym miesiącu"       },
  "hh.private_dash":    { en: "Private dashboard",          pl: "Prywatny dashboard"             },
  "hh.others_cant":     { en: "Others can't see your spending breakdown", pl: "Inni nie widzą Twojego zestawienia wydatków"},
  "hh.visible":         { en: "Your breakdown is visible to household members", pl: "Twoje zestawienie jest widoczne dla członków gospodarstwa"},
  "hh.pending_invites": { en: "Pending Invites",            pl: "Oczekujące zaproszenia"         },
  "hh.incoming_invites":{ en: "Invitations",               pl: "Zaproszenia"                    },
  "hh.invite_from":     { en: "Invited to join",           pl: "Zaproszono do"                  },
  "hh.accept":          { en: "Accept",                    pl: "Akceptuj"                       },
  "hh.decline":         { en: "Decline",                   pl: "Odrzuć"                         },
  "hh.invite_sent":     { en: "Invitation sent!",          pl: "Zaproszenie wysłane!"           },
  "hh.no_user_found":   { en: "No account found with this email address.", pl: "Nie znaleziono konta z tym adresem e-mail." },
  "hh.user_in_hh":      { en: "This user is already a member of another household.", pl: "Ten użytkownik jest już członkiem innego gospodarstwa." },
  "hh.expires":         { en: "Expires",                    pl: "Wygasa"                         },
  "hh.invite_title":    { en: "Invite to Household",        pl: "Zaproś do Gospodarstwa"         },
  "hh.invite_member":   { en: "Invite to Household",        pl: "Zaproś do Gospodarstwa"         },
  "hh.invite_btn":      { en: "Invite",                     pl: "Zaproś"                         },
  "hh.create_title":    { en: "Create Household",           pl: "Utwórz Gospodarstwo"            },
  "hh.send_invite":     { en: "Send Invite",                pl: "Wyślij zaproszenie"             },
  "hh.sending":         { en: "Sending…",                   pl: "Wysyłanie…"                     },
  "hh.delete_title":    { en: "Delete Household",           pl: "Usuń Gospodarstwo"              },
  "hh.delete_warning":  { en: "This action cannot be undone.", pl: "Tej operacji nie można cofnąć."},
  "hh.delete_desc":     { en: "Deleting {name} will remove all members from the household. Their transaction history will remain intact.",
                           pl: "Usunięcie {name} spowoduje usunięcie wszystkich członków z gospodarstwa. Historia transakcji pozostanie nienaruszona."},
  "hh.delete_confirm_q":{ en: "Are you sure you want to permanently delete this household?",
                           pl: "Czy na pewno chcesz trwale usunąć to gospodarstwo?"              },
  "hh.deleting":        { en: "Deleting…",                  pl: "Usuwanie…"                      },
  "hh.household_name":  { en: "Household name",             pl: "Nazwa gospodarstwa"             },
  "hh.name_placeholder":{ en: "The Johnsons, Apt 4B…",      pl: "Kowalscy, Mieszkanie 4B…"       },
  "hh.budget_optional": { en: "Monthly budget",             pl: "Miesięczny budżet"              },
  "hh.optional":        { en: "(optional)",                  pl: "(opcjonalnie)"                  },
  "hh.creating":        { en: "Creating…",                   pl: "Tworzenie…"                    },
  "hh.this_month":      { en: "This month",                  pl: "Ten miesiąc"                   },
  "hh.this_month_breakdown": { en: "This month's breakdown",  pl: "Zestawienie tego miesiąca"     },
  "hh.member_private_msg": { en: "This member has made their dashboard private.", pl: "Ten członek ustawił swój dashboard jako prywatny." },
  "hh.dashboard_private_msg": { en: "Dashboard is private.",  pl: "Dashboard jest prywatny."      },
  "hh.breakdown":       { en: "This month's breakdown",      pl: "Zestawienie tego miesiąca"      },
  "hh.total_this_month":{ en: "Total this month",            pl: "Łącznie ten miesiąc"            },
  "hh.budget_amount":   { en: "Budget amount",               pl: "Kwota budżetu"                  },
  "hh.monthly_budget_title": { en: "Monthly Budget",         pl: "Miesięczny budżet"              },

  // ── Notifications ──
  "notif.daily_reminders":{ en: "Daily Reminders",           pl: "Codzienne przypomnienia"        },
  "notif.timed_nudges":   { en: "Timed nudges to log your spending", pl: "Zaplanowane przypomnienia do logowania wydatków"},
  "notif.save":           { en: "Save Reminders",            pl: "Zapisz przypomnienia"           },
  "notif.on":             { en: "On",                        pl: "Włączone"                       },
  "notif.off":            { en: "Off",                       pl: "Wyłączone"                      },
  "notif.time":           { en: "Time",                      pl: "Czas"                           },
  "notif.days":           { en: "Days",                      pl: "Dni"                            },
  "notif.select_day":     { en: "Select at least one day.",  pl: "Wybierz co najmniej jeden dzień."},
  "notif.smart":          { en: "Smart Alerts",              pl: "Inteligentne alerty"            },
  "notif.smart_desc":     { en: "Automatic notifications based on your spending & goals", pl: "Automatyczne powiadomienia na podstawie wydatków i celów"},
  "notif.budget_thresh":  { en: "Budget Threshold Alerts",   pl: "Alerty progów budżetu"          },
  "notif.budget_thresh_desc": { en: "Get a reminder at 75% and a warning at 90% of any category or monthly budget.",
                                 pl: "Otrzymuj przypomnienie przy 75% i ostrzeżenie przy 90% dowolnego budżetu kategorii lub miesięcznego."},
  "notif.goal_prog":      { en: "Goal Progress Alerts",      pl: "Alerty postępu celów"           },
  "notif.goal_prog_desc": { en: "A week before month-end, get an update on how your savings goals are progressing.",
                             pl: "Tydzień przed końcem miesiąca otrzymasz aktualizację postępu oszczędności."},
  "notif.budget_fire":    { en: "Budget alerts fire when:",  pl: "Alerty budżetu uruchamiają się gdy:"},
  "notif.spending_75":    { en: "Spending hits 75% of a budget — friendly reminder", pl: "Wydatki osiągają 75% budżetu — przyjazne przypomnienie"},
  "notif.spending_90":    { en: "Spending hits 90% of a budget — urgent warning",    pl: "Wydatki osiągają 90% budżetu — pilne ostrzeżenie"},
  "notif.goal_fire":      { en: "Goal alerts fire when:",    pl: "Alerty celów uruchamiają się gdy:"},
  "notif.7_days":         { en: "7 or fewer days left in the month", pl: "7 lub mniej dni do końca miesiąca"},
  "notif.once_month":     { en: "Once per month, showing your progress toward each goal", pl: "Raz w miesiącu, pokazując postęp każdego celu"},
  "notif.alerts_saved":   { en: "Alerts saved",              pl: "Alerty zapisane"                },
  "notif.perm_denied":    { en: "Permission denied",         pl: "Odmowa dostępu"                 },
  "notif.enable_notif":   { en: "Enable notifications in your browser settings first.", pl: "Najpierw włącz powiadomienia w ustawieniach przeglądarki."},
  "notif.alert_enabled":  { en: "Alert enabled",             pl: "Alert włączony"                 },
  "notif.alert_disabled": { en: "Alert disabled",            pl: "Alert wyłączony"                },
  "notif.budger_reminder":{ en: "Budger Reminder",           pl: "Przypomnienie Budger"           },
  "notif.dont_forget":    { en: "Don't forget to log today's spending!", pl: "Nie zapomnij zalogować dzisiejszych wydatków!"},
  "notif.blocked":        { en: "Browser notifications are blocked. Enable them in your device / browser settings to use any alerts.",
                             pl: "Powiadomienia przeglądarki są zablokowane. Włącz je w ustawieniach urządzenia/przeglądarki, aby korzystać z alertów."},
  "notif.enable_settings":{ en: "Enable notifications in your browser settings.", pl: "Włącz powiadomienia w ustawieniach przeglądarki."},

  // ── Login ──
  "login.tagline":     { en: "Your household finances, in one place.", pl: "Twoje finanse domowe, w jednym miejscu."},
  "login.sign_in":     { en: "Sign in",          pl: "Zaloguj się"      },
  "login.no_password": { en: "No password needed", pl: "Nie potrzeba hasła"},
  "login.your_name":   { en: "Your name",        pl: "Twoje imię"       },
  "login.continue":    { en: "Continue",         pl: "Kontynuuj"        },
  "login.signing_in":  { en: "Signing in…",      pl: "Logowanie…"       },
  "login.failed":      { en: "Sign-in failed. Please try again.", pl: "Logowanie nie powiodło się. Spróbuj ponownie."},
  "login.footer":      { en: "Budger © 2026",    pl: "Budger © 2026"   },

  // ── Onboarding ──
  "ob.welcome":        { en: "Welcome to Budger!",             pl: "Witaj w Budger!"              },
  "ob.tagline":        { en: "Your household finances in one place.", pl: "Twoje finanse domowe w jednym miejscu."},
  "ob.setup":          { en: "Let's set up in 30 seconds.",    pl: "Skonfigurujmy w 30 sekund."   },
  "ob.home_currency":  { en: "Home currency",                  pl: "Waluta domyślna"              },
  "ob.how_shown":      { en: "How amounts are shown throughout the app", pl: "Sposób wyświetlania kwot w aplikacji"},
  "ob.language":       { en: "Language",                       pl: "Język"                        },
  "ob.lang_desc":      { en: "Numbers and dates adapt to your region", pl: "Liczby i daty dostosowują się do Twojego regionu"},
  "ob.apple_pay":      { en: "Apple Pay",                      pl: "Apple Pay"                    },
  "ob.check_compat":   { en: "Check your device's compatibility", pl: "Sprawdź kompatybilność urządzenia"},
  "ob.secure":         { en: "Secure connection (HTTPS)",      pl: "Bezpieczne połączenie (HTTPS)"},
  "ob.safari":         { en: "Safari browser on iPhone / Mac", pl: "Przeglądarka Safari na iPhone/Mac"},
  "ob.wallet":         { en: "Cards added to Apple Wallet",    pl: "Karty dodane do Apple Wallet" },
  "ob.ap_ready":       { en: "Apple Pay is ready on this device!", pl: "Apple Pay jest gotowy na tym urządzeniu!"},
  "ob.ap_dev":         { en: "Apple Pay works on the published app (HTTPS). In this dev preview it can't be activated, but it will work after publishing.",
                          pl: "Apple Pay działa na opublikowanej aplikacji (HTTPS). W tym podglądzie deweloperskim nie można go aktywować, ale zadziała po opublikowaniu."},
  "ob.ap_unavail":     { en: "Open Budger in Safari on iPhone or Mac and add cards to Apple Wallet to enable Apple Pay.",
                          pl: "Otwórz Budger w Safari na iPhone lub Mac i dodaj karty do Apple Wallet, aby włączyć Apple Pay."},
  "ob.how_works":      { en: "How it works in Budger",         pl: "Jak działa w Budger"          },
  "ob.ap_explainer":   { en: "When you add a transaction, tap the Apple Pay button to confirm the amount with Face ID or Touch ID — no card entry needed.",
                          pl: "Dodając transakcję, dotknij przycisku Apple Pay, aby potwierdzić kwotę Face ID lub Touch ID — bez wpisywania karty."},
  "ob.note":           { en: "Note:",                          pl: "Uwaga:"                       },
  "ob.cross_app":      { en: "Apple restricts cross-app data on all devices, so Budger cannot auto-import payments made in other apps (Maps, App Store, etc.). Each transaction is logged manually — it takes just a few seconds.",
                          pl: "Apple ogranicza dane między aplikacjami na wszystkich urządzeniach, więc Budger nie może automatycznie importować płatności z innych aplikacji (Mapy, App Store itp.). Każda transakcja jest logowana ręcznie — zajmuje to tylko kilka sekund."},
  "ob.lets_go":        { en: "Let's go!",                      pl: "Zaczynajmy!"                  },
  "ob.continue":       { en: "Continue →",                     pl: "Kontynuuj →"                  },

  // ── Invite ──
  "invite.revoked":      { en: "Invite revoked",               pl: "Zaproszenie odwołane"         },
  "invite.revoked_msg":  { en: "This invite link has been cancelled by the household owner.", pl: "Ten link zaproszenia został anulowany przez właściciela gospodarstwa."},
  "invite.go_to_app":    { en: "Go to App",                    pl: "Przejdź do aplikacji"         },
  "invite.not_found":    { en: "Invite not found",             pl: "Zaproszenie nie znalezione"   },
  "invite.expired_msg":  { en: "This invite link may be expired or invalid.", pl: "Ten link zaproszenia mógł wygasnąć lub jest nieprawidłowy."},
  "invite.youre_invited":{ en: "You're invited!",              pl: "Jesteś zaproszony!"           },
  "invite.join_msg":     { en: "Join {name} on Budger to track household spending together.", pl: "Dołącz do {name} w Budger, aby śledzić razem wydatki domowe."},
  "invite.create_or_signin": { en: "Create an account or sign in to accept", pl: "Utwórz konto lub zaloguj się, aby przyjąć zaproszenie"},
  "invite.join_btn":     { en: "Join {name}",                  pl: "Dołącz do {name}"             },
  "invite.joining":      { en: "Joining...",                   pl: "Dołączanie..."                },
  "invite.expires":      { en: "Expires {date}",               pl: "Wygasa {date}"                },

  // ── Currency conversion ──
  "currency.converting": { en: "Converting currency…",         pl: "Przeliczanie waluty…"         },
  "currency.converted":  { en: "Currency converted",           pl: "Waluta przeliczona"           },
  "currency.failed":     { en: "Conversion failed",            pl: "Przeliczanie nie powiodło się"},
  "currency.offline_rates": { en: "Offline — using last known rates", pl: "Offline — używam ostatnich kursów"},

  // ── Home additional ──
  "home.current_month":       { en: "current month",           pl: "obecny miesiąc"               },
  "home.total_spent":         { en: "Total spent",             pl: "Całkowite wydatki"            },
  "home.entries":             { en: "Entries",                 pl: "Wpisy"                        },
  "home.new_tx":              { en: "New Transaction",         pl: "Nowa Transakcja"              },
  "home.total_budget_label":  { en: "Total monthly budget",    pl: "Całkowity miesięczny budżet"  },
  "home.budget_cap_desc":     { en: "This is your total spending cap for the month. Leave blank to remove.", pl: "To jest Twój miesięczny limit wydatków. Zostaw puste, aby usunąć." },
  "home.budget_eg":           { en: "e.g. 3000",               pl: "np. 3000"                     },
  "home.edit_btn":            { en: "Edit",                    pl: "Edytuj"                       },
  "home.edit_tx_title":       { en: "Edit Transaction",        pl: "Edytuj Transakcję"            },
  "home.receipt_btn":         { en: "Receipt",                 pl: "Paragon"                      },
  "home.mo":                  { en: "/mo",                     pl: "/msc"                         },

  // ── Goals additional ──
  "goals.private_goals":    { en: "Private Goals",             pl: "Prywatne Cele"                },
  "goals.household_goals":  { en: "Household Goals",           pl: "Cele Gospodarstwa"            },
  "goals.create_first":     { en: "Create first goal",         pl: "Utwórz pierwszy cel"          },
  "goals.no_private":       { en: "No private goals.",         pl: "Brak prywatnych celów."       },
  "goals.no_household":     { en: "No household goals yet.",   pl: "Brak celów gospodarstwa."     },
  "goals.edit_private_hint":{ en: "Edit a private goal and make it a Household Goal.", pl: "Edytuj prywatny cel i ustaw go jako Cel Gospodarstwa." },
  "goals.propose_via_edit": { en: "Propose a goal to the household owner via Edit.", pl: "Zaproponuj cel właścicielowi przez Edytuj." },
  "goals.past_goals":       { en: "Past Goals",                pl: "Przeszłe Cele"               },
  "goals.edit_title":       { en: "Edit Goal",                 pl: "Edytuj Cel"                  },
  "goals.date_placeholder": { en: "DD/MM/YYYY",               pl: "DD/MM/RRRR"                  },
  "goals.create_btn":       { en: "Create",                    pl: "Stwórz"                      },
  "goals.creating_btn":     { en: "Creating…",                 pl: "Tworzenie…"                  },
  "goals.target_due":       { en: "Target: {amt} · Due {date}",pl: "Cel: {amt} · Termin {date}"  },
  "goals.saved_amt":        { en: "saved",                     pl: "zaoszczędzono"               },
  "goals.goal_label":       { en: "goal",                      pl: "cel"                         },
  "goals.save_mo_for":      { en: "Save {amt}/mo · {ml} month{s} left", pl: "Oszczędź {amt}/msc · pozostało {ml} mies." },
  "goals.ended":            { en: "Ended",                     pl: "Zakończono"                  },
  "goals.edit_btn":         { en: "Edit",                      pl: "Edytuj"                      },
  "goals.delete_btn":       { en: "Delete",                    pl: "Usuń"                        },
  "goals.title_desc":       { en: "Set targets, track progress", pl: "Ustalaj cele, śledź postępy" },
  "goals.page_subtitle":    { en: "Track savings toward your targets", pl: "Śledź oszczędności na swoje cele" },
  "goals.new_btn":          { en: "New",                        pl: "Nowy"                        },
  "goals.request_shared":   { en: "Request owner to make this a shared goal", pl: "Poproś właściciela o udostępnienie celu" },

  // ── Categories additional ──
  "cat.monthly_budget_opt": { en: "Monthly Budget (optional)",  pl: "Miesięczny Budżet (opcjonalnie)" },
  "cat.name_label":         { en: "Name",                      pl: "Nazwa"                       },
  "cat.color_label":        { en: "Color",                     pl: "Kolor"                       },
  "cat.amount_pct":         { en: "Amount / % of total",       pl: "Kwota / % całkowitego"       },
  "cat.create_btn":         { en: "Create",                    pl: "Stwórz"                      },
  "cat.mo":                 { en: "/mo",                       pl: "/msc"                        },

  // ── Household additional ──
  "hh.create_share_msg":    { en: "Create one to share expenses with family or roommates", pl: "Utwórz, aby dzielić wydatki z rodziną lub współlokatorami" },
  "hh.you_label":           { en: "(You)",                     pl: "(Ty)"                        },
  "hh.due":                 { en: "due",                       pl: "do"                          },
  "hh.of_goal":             { en: "of",                        pl: "z"                           },
  "hh.household_name_label":{ en: "Household name",            pl: "Nazwa gospodarstwa"          },
  "hh.monthly_budget_lbl":  { en: "Monthly budget",            pl: "Miesięczny budżet"           },
  "hh.optional_lbl":        { en: "(optional)",                pl: "(opcjonalnie)"               },
  "hh.budget_eg":           { en: "e.g. 5000",                 pl: "np. 5000"                    },
  "hh.delete_dialog_title": { en: "Delete Household",          pl: "Usuń Gospodarstwo"           },
  "hh.delete_cannot_undo":  { en: "This action cannot be undone.", pl: "Tej operacji nie można cofnąć." },
  "hh.delete_full_desc":    { en: "will remove all members from the household. Their transaction history will remain intact.", pl: "spowoduje usunięcie wszystkich członków z gospodarstwa. Historia transakcji pozostanie nienaruszona." },
  "hh.delete_are_you_sure": { en: "Are you sure you want to permanently delete this household?", pl: "Czy na pewno chcesz trwale usunąć to gospodarstwo?" },
  "hh.delete_btn":          { en: "Delete Household",          pl: "Usuń Gospodarstwo"           },
  "hh.deleting_btn":        { en: "Deleting…",                 pl: "Usuwanie…"                   },
  "hh.budget_amount_lbl":   { en: "Budget amount",             pl: "Kwota budżetu"               },
  "hh.email_lbl":           { en: "Email address",             pl: "Adres e-mail"                },
  "hh.category_col":        { en: "Category",                  pl: "Kategoria"                   },
  "hh.amount_col":          { en: "Amount",                    pl: "Kwota"                       },
  "hh.total_month_txt":     { en: "Total this month",          pl: "Łącznie ten miesiąc"         },
  "hh.private_dash_lbl":    { en: "Private dashboard",         pl: "Prywatny Pulpit"             },
  "hh.remove_member_confirm":{ en: "Remove {name} from the household?", pl: "Usunąć {name} z gospodarstwa?" },
  "hh.deleting_tx":         { en: "Deleting",                  pl: "Usuwanie"                    },

  // ── Household roles ──
  "hh.role_head":               { en: "Head",                     pl: "Szef"                                   },
  "hh.role_parent":             { en: "Parent",                   pl: "Rodzic"                                 },
  "hh.role_child":              { en: "Child",                    pl: "Dziecko"                                },
  "hh.role_label":              { en: "Member role",              pl: "Rola członka"                           },
  "hh.your_role":               { en: "Your role",                pl: "Twoja rola"                             },
  "hh.set_as_role":             { en: "Set as {role}",            pl: "Ustaw jako {role}"                      },
  "hh.this_month_spending":     { en: "This month's spending",    pl: "Wydatki w tym miesiącu"                 },
  "hh.role_head_desc_editor":   { en: "Full access. Can manage goals, roles, and see all dashboards.",
                                   pl: "Pełny dostęp. Zarządzaj celami, rolami i przeglądaj wszystkie pulpity." },
  "hh.role_parent_desc_editor": { en: "Full access except cannot delete household goals. Can propose goals. Cannot see head's private dashboard.",
                                   pl: "Pełny dostęp z wyjątkiem usuwania celów. Może proponować cele. Nie widzi prywatnego pulpitu szefa." },
  "hh.role_child_desc_editor":  { en: "Can propose goals. Cannot see private dashboards or set their own private.",
                                   pl: "Może proponować cele. Nie może ustawiać prywatnego pulpitu ani widzieć prywatnych pulpitów." },
  "hh.your_role_head_desc":     { en: "Full access. Manage goals, roles, and members.",
                                   pl: "Pełny dostęp. Zarządzaj celami, rolami i członkami."                  },
  "hh.your_role_parent_desc":   { en: "Can propose household goals. Head can always see your dashboard.",
                                   pl: "Może proponować cele. Szef zawsze widzi Twój pulpit."                  },
  "hh.your_role_child_desc":    { en: "Can propose household goals. Cannot set a private dashboard.",
                                   pl: "Może proponować cele. Nie może ustawić prywatnego pulpitu."            },
  "hh.privacy_parent_on":       { en: "Hidden from children. Head of household can still see.",
                                   pl: "Ukryty przed dziećmi. Szef gospodarstwa nadal widzi."                  },
  "hh.privacy_head_on":         { en: "Hidden from all other members.",
                                   pl: "Ukryty przed wszystkimi innymi członkami."                             },
  "hh.privacy_parent_off":      { en: "Visible to everyone. Head can always see yours.",
                                   pl: "Widoczny dla wszystkich. Szef zawsze widzi Twój pulpit."               },
  "hh.role_invite_label":       { en: "Role",                     pl: "Rola"                                   },
  "hh.invite_as_role":          { en: "as {role}",                pl: "jako {role}"                            },
  "hh.invite_role_head_desc":   { en: "Full access. Can manage goals, members, and see all dashboards.",
                                   pl: "Pełny dostęp. Zarządzaj celami, członkami i przeglądaj wszystkie pulpity." },
  "hh.invite_role_parent_desc": { en: "Full access except cannot delete household goals. Can propose goals.",
                                   pl: "Pełny dostęp z wyjątkiem usuwania celów. Może proponować cele."       },
  "hh.invite_role_child_desc":  { en: "View-only for private dashboards. Can propose household goals.",
                                   pl: "Tylko podgląd prywatnych pulpitów. Może proponować cele."              },
  "hh.not_found":               { en: "Not found",                pl: "Nie znaleziono"                         },
  "hh.try_again":               { en: "Try again",                pl: "Spróbuj ponownie"                       },
  "hh.already_in_hh":           { en: "Already in a household",   pl: "Już w gospodarstwie"                    },

  // ── Dashboard additional ──
  "dashboard.by":           { en: "by",                        pl: "do"                          },
  "dashboard.mo_needed":    { en: "/mo needed",                pl: "/msc ustalono"               },
  "dashboard.mo_target":    { en: "/mo target",                pl: "/msc"                        },
  "dashboard.total_goal":   { en: "total goal",                pl: "cel łącznie"                 },
};

// ── Locale-aware date helpers ──────────────────────────────────────────────
const PL_MONTHS_LONG  = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
const PL_MONTHS_SHORT = ["Sty","Lut","Mar","Kwi","Maj","Cze","Lip","Sie","Wrz","Paź","Lis","Gru"];
const EN_MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PL_DAYS_SHORT   = ["Nd","Pn","Wt","Śr","Cz","Pt","Sb"]; // Sunday=0
const EN_DAYS_SHORT   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/** "June 2026" → "Czerwiec 2026" in Polish */
export function fmtMonthYear(date: Date): string {
  const lang = loadPrefs().language as Lang;
  if (lang === "pl") return `${PL_MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

/** "2025-06-11" → "Thu, 11 Jun" or "Cz, 11 Cze" */
export function fmtDayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const lang = loadPrefs().language as Lang;
  if (lang === "pl") {
    return `${PL_DAYS_SHORT[d.getDay()]}, ${d.getDate()} ${PL_MONTHS_SHORT[d.getMonth()]}`;
  }
  return `${EN_DAYS_SHORT[d.getDay()]}, ${d.getDate()} ${EN_MONTHS_SHORT[d.getMonth()]}`;
}

/** Short month name for a Date (Jan / Sty) */
export function fmtMonthShort(date: Date): string {
  const lang = loadPrefs().language as Lang;
  return lang === "pl" ? PL_MONTHS_SHORT[date.getMonth()] : EN_MONTHS_SHORT[date.getMonth()];
}

/** "Jan" → "Sty" etc. for API-returned month strings */
export function localiseMonthStr(s: string): string {
  const lang = loadPrefs().language as Lang;
  if (lang !== "pl") return s;
  const idx = EN_MONTHS_SHORT.indexOf(s);
  return idx >= 0 ? PL_MONTHS_SHORT[idx] : s;
}

/** Returns locale-aware single-letter / two-letter day labels */
export function getDayLabels(): string[] {
  const lang = loadPrefs().language as Lang;
  return lang === "pl"
    ? ["Pn","Wt","Śr","Cz","Pt","Sb","Nd"]
    : ["M","T","W","T","F","S","S"];
}

export function t(key: string, params?: Record<string, string | number>): string {
  const lang = loadPrefs().language as Lang;
  let str = translations[key]?.[lang] ?? translations[key]?.["en"] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

export function useT(): (key: string, params?: Record<string, string | number>) => string {
  return t;
}
