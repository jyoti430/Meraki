import type { TranslationDictionary } from './en'

const supplySafety = {
  sp_confirm_plan: '{quantity} ആസൂത്രണ റിസർവേഷനോടെ ഈ പദ്ധതി സ്ഥിരീകരിക്കണോ?',
  sp_demand_uncovered: 'ആവശ്യത്തിന്റെ {quantity} ഭാഗം നിറവേറാതെ ശേഷിക്കും.',
  sp_order_indicative: 'ഈ ഓർഡർ സൂചന മാത്രമാണ്; സ്ഥിരീകരിച്ച വാണിജ്യ പ്രതിബദ്ധതയല്ല.',
  sp_reservations_estimate: 'റിസർവേഷനുകൾ കണക്കുകളാണ്; വിളവെടുത്തതോ ലഭ്യമായതോ ആയ സ്റ്റോക്കല്ല.',
  sp_plan_list_limit: 'രേഖപ്പെടുത്തിയ സമ്മതം, വിളയുടെ പൊരുത്തം, വിളവെടുപ്പ് സമയങ്ങളുടെ ഒത്തുചേരൽ, സജീവ റിസർവേഷനുകൾ എന്നിവയെ ആശ്രയിച്ചാണ് കണക്കുകൾ. വിതരണത്തിനോ ഗുണനിലവാരത്തിനോ ഉറപ്പില്ല.',
  sp_reservations_after_confirmation: 'പൂജ്യത്തേക്കാൾ കൂടുതലുള്ള വിഹിതത്തിന് പദ്ധതി സ്ഥിരീകരിച്ച ശേഷമേ ആസൂത്രണ റിസർവേഷൻ സൃഷ്ടിക്കൂ.',
  sp_crop_quality_limit: 'വിളയുടെ പൊരുത്തം മാത്രം വാങ്ങുന്നയാളുടെ ഗുണനിലവാരം ഉറപ്പാക്കുന്നില്ല.',
  sp_estimate_evidence_limit: 'ഈ നിർദ്ദേശം കൃത്രിമവും കർഷകർ അറിയിച്ചതുമായ കണക്കുകൾ ഉപയോഗിക്കുന്നു. ഇത് വിളയുടെ ഗുണനിലവാരം പരിശോധിക്കുകയോ വിളവെടുത്ത സ്റ്റോക്ക് സൃഷ്ടിക്കുകയോ വിതരണം ഉറപ്പാക്കുകയോ ചെയ്യുന്നില്ല.',
  sp_consent_label: 'സമ്മതം', sp_eligible: 'പരിഗണിക്കാം', sp_excluded: 'ഒഴിവാക്കി',
  sp_consent_opted_in: 'സമ്മതിച്ചു', sp_consent_opted_out: 'സമ്മതം പിൻവലിച്ചു', sp_consent_not_recorded: 'രേഖപ്പെടുത്തിയിട്ടില്ല', sp_consent_unavailable: 'ലഭ്യമല്ല',
  sp_reason_member_inactive: 'കർഷകന്റെ അംഗത്വം സജീവമല്ല.', sp_reason_consent_opted_out: 'പൊതു വിതരണ പദ്ധതിയിലുള്ള സമ്മതം കർഷകൻ പിൻവലിച്ചു.', sp_reason_consent_unavailable: 'പൊതു വിതരണ പദ്ധതിക്ക് കർഷകൻ ലഭ്യമല്ല.', sp_reason_consent_missing: 'പൊതു വിതരണ പദ്ധതിക്ക് കർഷകൻ സമ്മതം നൽകിയിട്ടില്ല.', sp_reason_programme_opted_out: 'പൊതു പദ്ധതിയുടെ ഏറ്റവും പുതിയ രേഖയിൽ സമ്മതം നൽകിയിട്ടില്ല.', sp_reason_scoped_programme_unavailable: 'ഈ വിതരണ പദ്ധതിക്ക് കർഷകൻ സമ്മതം നൽകിയിട്ടില്ല.', sp_reason_order_unavailable: 'ഈ വാങ്ങുന്നയാളുടെ ഓർഡറിന് കർഷകൻ സമ്മതം നൽകിയിട്ടില്ല.',
  sp_warning_water_unknown: 'ഈ പ്ലോട്ടിലെ ജലലഭ്യത അറിയില്ല.', sp_warning_quality_unassessed: 'വിളചക്ര രേഖകളിൽ നിന്ന് വാങ്ങുന്നയാളുടെ പ്രത്യേക ഗുണനിലവാരവും രേഖാ ആവശ്യങ്ങളും പരിശോധിച്ചിട്ടില്ല.', sp_warning_constraint_recorded: 'വിളചക്രവുമായി ബന്ധപ്പെട്ട ഒന്നോ അതിലധികമോ വിതരണ നിയന്ത്രണങ്ങൾ രേഖപ്പെടുത്തിയിട്ടുണ്ട്; സ്ഥിരീകരിക്കുന്നതിന് മുമ്പ് പരിശോധിക്കുക.',
  sp_include_candidate: 'ഉൾപ്പെടുത്തുക', sp_adjustment_reason: 'മാറ്റത്തിന് കാരണം ആവശ്യമാണ്', sp_allocation_for: '{id}ക്കുള്ള നിർദ്ദേശിച്ച വിഹിതം', sp_adjustment_for: '{id}യിലെ മാറ്റത്തിന്റെ കാരണം',
  sp_filter_all: 'എല്ലാ നിലകളും', sp_filter_status: 'പദ്ധതിയുടെ നില', sp_reset_engine_proposal: 'എഞ്ചിൻ നിർദ്ദേശത്തിലേക്ക് പുനഃക്രമീകരിക്കുക',
  sp_status_draft: 'കരട്', sp_status_previewed: 'പ്രിവ്യൂ ചെയ്തു', sp_status_confirmed: 'സ്ഥിരീകരിച്ചു', sp_status_needs_review: 'പരിശോധന വേണം', sp_status_cancelled: 'റദ്ദാക്കി',
} satisfies Partial<TranslationDictionary>

export default supplySafety
