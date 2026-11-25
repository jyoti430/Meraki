import type { TranslationDictionary } from './en'

const supplySafety = {
  sp_confirm_plan: 'क्या इस योजना को {quantity} की नियोजन आरक्षित मात्रा के साथ पुष्टि करें?',
  sp_demand_uncovered: 'मांग की {quantity} मात्रा पूरी नहीं होगी।',
  sp_order_indicative: 'यह ऑर्डर संकेतात्मक है, पक्का वाणिज्यिक वादा नहीं।',
  sp_reservations_estimate: 'आरक्षण अनुमान हैं; इन्हें कटी हुई उपज या उपलब्ध स्टॉक न मानें।',
  sp_plan_list_limit: 'अनुमान दर्ज सहमति, फसल की अनुकूलता, कटाई अवधि के मेल और सक्रिय आरक्षण पर निर्भर हैं। डिलीवरी या गुणवत्ता के परिणाम की गारंटी नहीं है।',
  sp_reservations_after_confirmation: 'शून्य से अधिक आवंटन पर योजना की पुष्टि के बाद ही नियोजन आरक्षण बनता है।',
  sp_crop_quality_limit: 'फसल की अनुकूलता से खरीदार की गुणवत्ता की पुष्टि नहीं होती।',
  sp_estimate_evidence_limit: 'यह प्रस्ताव कृत्रिम और किसान द्वारा बताए अनुमानों पर आधारित है। इससे फसल की गुणवत्ता सत्यापित नहीं होती, कटा हुआ स्टॉक नहीं बनता और पूर्ति की गारंटी नहीं मिलती।',
  sp_consent_label: 'सहमति', sp_eligible: 'विचार योग्य', sp_excluded: 'शामिल नहीं',
  sp_consent_opted_in: 'सहमति दी', sp_consent_opted_out: 'सहमति वापस ली', sp_consent_not_recorded: 'दर्ज नहीं', sp_consent_unavailable: 'उपलब्ध नहीं',
  sp_reason_member_inactive: 'किसान की सदस्यता निष्क्रिय है।', sp_reason_consent_opted_out: 'किसान ने सामान्य आपूर्ति कार्यक्रम से सहमति वापस ली है।', sp_reason_consent_unavailable: 'किसान सामान्य आपूर्ति कार्यक्रम के लिए उपलब्ध नहीं हैं।', sp_reason_consent_missing: 'किसान ने सामान्य आपूर्ति कार्यक्रम के लिए सहमति नहीं दी है।', sp_reason_programme_opted_out: 'सामान्य कार्यक्रम की नवीनतम प्रविष्टि में सहमति दर्ज नहीं है।', sp_reason_scoped_programme_unavailable: 'किसान ने इस आपूर्ति कार्यक्रम के लिए सहमति नहीं दी है।', sp_reason_order_unavailable: 'किसान ने इस खरीदार ऑर्डर के लिए सहमति नहीं दी है।',
  sp_warning_water_unknown: 'इस प्लॉट के लिए पानी की उपलब्धता अज्ञात है।', sp_warning_quality_unassessed: 'फसल चक्र रिकॉर्ड से खरीदार की विशिष्ट गुणवत्ता और दस्तावेज़ आवश्यकताओं की पुष्टि नहीं होती।', sp_warning_constraint_recorded: 'फसल चक्र की एक या अधिक आपूर्ति सीमाएँ दर्ज हैं; पुष्टि से पहले उनकी समीक्षा करें।',
  sp_include_candidate: 'शामिल करें', sp_adjustment_reason: 'बदलाव का कारण आवश्यक है', sp_allocation_for: '{id} के लिए प्रस्तावित आवंटन', sp_adjustment_for: '{id} के बदलाव का कारण',
  sp_filter_all: 'सभी स्थितियाँ', sp_filter_status: 'योजना की स्थिति', sp_reset_engine_proposal: 'इंजन के प्रस्ताव पर लौटें',
  sp_status_draft: 'मसौदा', sp_status_previewed: 'पूर्वावलोकित', sp_status_confirmed: 'पुष्टि की गई', sp_status_needs_review: 'समीक्षा आवश्यक', sp_status_cancelled: 'रद्द',
} satisfies Partial<TranslationDictionary>

export default supplySafety
