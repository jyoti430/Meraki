import type { TranslationDictionary } from './en'

const supplySafety = {
  sp_confirm_plan: 'இந்தத் திட்டத்தை {quantity} திட்டமிடல் ஒதுக்கீட்டுடன் உறுதிப்படுத்தவா?',
  sp_demand_uncovered: 'தேவையில் {quantity} பூர்த்தியாகாமல் இருக்கும்.',
  sp_order_indicative: 'இந்த ஆர்டர் ஒரு குறிப்பு மட்டுமே; உறுதிப்படுத்தப்பட்ட வணிக ஒப்பந்தம் அல்ல.',
  sp_reservations_estimate: 'ஒதுக்கீடுகள் மதிப்பீடுகள் மட்டுமே; அறுவடை செய்யப்பட்ட இருப்பு அல்ல.',
  sp_plan_list_limit: 'மதிப்பீடுகள் பதிவு செய்யப்பட்ட ஒப்புதல், பயிர் பொருத்தம், அறுவடை கால ஒத்திசைவு மற்றும் செயலில் உள்ள ஒதுக்கீடுகளைப் பொறுத்தவை. விநியோகம் அல்லது தரத்திற்கு உத்தரவாதம் இல்லை.',
  sp_reservations_after_confirmation: 'பூஜ்ஜியத்தை விட அதிகமான ஒதுக்கீடு, திட்டம் உறுதிப்படுத்தப்பட்ட பிறகே திட்டமிடல் ஒதுக்கீடாகும்.',
  sp_crop_quality_limit: 'பயிர் பொருத்தம் மட்டும் வாங்குநரின் தரத்தை உறுதிப்படுத்தாது.',
  sp_estimate_evidence_limit: 'இந்த முன்மொழிவு செயற்கை மற்றும் விவசாயி தெரிவித்த மதிப்பீடுகளைப் பயன்படுத்துகிறது. இது பயிர்த் தரத்தைச் சரிபார்க்காது, அறுவடை செய்யப்பட்ட இருப்பை உருவாக்காது, விநியோகத்திற்கும் உத்தரவாதம் அளிக்காது.',
  sp_consent_label: 'ஒப்புதல்', sp_eligible: 'பரிசீலிக்கத் தகுதி', sp_excluded: 'நீக்கப்பட்டது',
  sp_consent_opted_in: 'ஒப்புதல் அளித்தார்', sp_consent_opted_out: 'ஒப்புதலைத் திரும்பப் பெற்றார்', sp_consent_not_recorded: 'பதிவு செய்யப்படவில்லை', sp_consent_unavailable: 'கிடைக்கவில்லை',
  sp_reason_member_inactive: 'விவசாயியின் உறுப்பினர் நிலை செயலற்றது.', sp_reason_consent_opted_out: 'பொது விநியோகத் திட்டத்திற்கான ஒப்புதலை விவசாயி திரும்பப் பெற்றுள்ளார்.', sp_reason_consent_unavailable: 'பொது விநியோகத் திட்டத்தில் விவசாயி கிடைக்கவில்லை.', sp_reason_consent_missing: 'பொது விநியோகத் திட்டத்திற்கு விவசாயி ஒப்புதல் அளிக்கவில்லை.', sp_reason_programme_opted_out: 'பொது திட்டத்தின் சமீபத்திய பதிவில் ஒப்புதல் இல்லை.', sp_reason_scoped_programme_unavailable: 'இந்த விநியோகத் திட்டத்திற்கு விவசாயி ஒப்புதல் அளிக்கவில்லை.', sp_reason_order_unavailable: 'இந்த வாங்குநர் ஆர்டருக்கு விவசாயி ஒப்புதல் அளிக்கவில்லை.',
  sp_warning_water_unknown: 'இந்த நிலத்துண்டில் நீர் கிடைப்பது தெரியவில்லை.', sp_warning_quality_unassessed: 'பயிர்ச் சுழற்சி பதிவுகள் வாங்குநரின் குறிப்பிட்ட தரம் மற்றும் ஆவணத் தேவைகளைச் சரிபார்க்கவில்லை.', sp_warning_constraint_recorded: 'பயிர்ச் சுழற்சிக்கான ஒன்று அல்லது அதற்கு மேற்பட்ட விநியோகக் கட்டுப்பாடுகள் பதிவு செய்யப்பட்டுள்ளன; உறுதிப்படுத்தும் முன் அவற்றை மதிப்பாய்வு செய்யவும்.',
  sp_include_candidate: 'சேர்க்கவும்', sp_adjustment_reason: 'மாற்றத்திற்கான காரணம் தேவை', sp_allocation_for: '{id}க்கான முன்மொழியப்பட்ட ஒதுக்கீடு', sp_adjustment_for: '{id}க்கான மாற்றக் காரணம்',
  sp_filter_all: 'அனைத்து நிலைகளும்', sp_filter_status: 'திட்ட நிலை', sp_reset_engine_proposal: 'இயந்திர முன்மொழிவுக்கு மீட்டமைக்கவும்',
  sp_status_draft: 'வரைவு', sp_status_previewed: 'முன்னோட்டம்', sp_status_confirmed: 'உறுதிப்படுத்தப்பட்டது', sp_status_needs_review: 'மதிப்பாய்வு தேவை', sp_status_cancelled: 'ரத்து செய்யப்பட்டது',
} satisfies Partial<TranslationDictionary>

export default supplySafety
