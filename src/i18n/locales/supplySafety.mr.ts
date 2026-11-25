import type { TranslationDictionary } from './en'

const supplySafety = {
  sp_confirm_plan: 'या योजनेची {quantity} नियोजन आरक्षणासह पुष्टी करायची?',
  sp_demand_uncovered: 'मागणीतील {quantity} भाग पूर्ण होणार नाही.',
  sp_order_indicative: 'ही ऑर्डर सूचक आहे; निश्चित व्यावसायिक बांधिलकी नाही.',
  sp_reservations_estimate: 'आरक्षणे अंदाज आहेत; काढलेला माल किंवा उपलब्ध साठा नाहीत.',
  sp_plan_list_limit: 'अंदाज नोंदवलेली संमती, पिकाची सुसंगतता, कापणीच्या कालावधीचा मेळ आणि सक्रिय आरक्षणांवर अवलंबून आहेत. वितरण किंवा गुणवत्तेची हमी नाही.',
  sp_reservations_after_confirmation: 'शून्यापेक्षा जास्त वाटपासाठी योजनेची पुष्टी झाल्यानंतरच नियोजन आरक्षण तयार होते.',
  sp_crop_quality_limit: 'पीक सुसंगतता म्हणजे खरेदीदाराच्या गुणवत्तेची खात्री नाही.',
  sp_estimate_evidence_limit: 'हा प्रस्ताव कृत्रिम आणि शेतकऱ्याने सांगितलेल्या अंदाजांवर आधारित आहे. यातून मालाची गुणवत्ता पडताळली जात नाही, कापलेला साठा तयार होत नाही किंवा पूर्ततेची हमी मिळत नाही.',
  sp_consent_label: 'संमती', sp_eligible: 'विचारासाठी पात्र', sp_excluded: 'वगळले',
  sp_consent_opted_in: 'संमती दिली', sp_consent_opted_out: 'संमती मागे घेतली', sp_consent_not_recorded: 'नोंद नाही', sp_consent_unavailable: 'उपलब्ध नाही',
  sp_reason_member_inactive: 'शेतकऱ्याचे सदस्यत्व निष्क्रिय आहे.', sp_reason_consent_opted_out: 'शेतकऱ्याने सामान्य पुरवठा कार्यक्रमाची संमती मागे घेतली आहे.', sp_reason_consent_unavailable: 'शेतकरी सामान्य पुरवठा कार्यक्रमासाठी उपलब्ध नाहीत.', sp_reason_consent_missing: 'शेतकऱ्याने सामान्य पुरवठा कार्यक्रमासाठी संमती दिलेली नाही.', sp_reason_programme_opted_out: 'सामान्य कार्यक्रमाच्या ताज्या नोंदीत संमती नाही.', sp_reason_scoped_programme_unavailable: 'शेतकऱ्याने या पुरवठा कार्यक्रमासाठी संमती दिलेली नाही.', sp_reason_order_unavailable: 'शेतकऱ्याने या खरेदीदार ऑर्डरसाठी संमती दिलेली नाही.',
  sp_warning_water_unknown: 'या प्लॉटसाठी पाण्याची उपलब्धता अज्ञात आहे.', sp_warning_quality_unassessed: 'पीकचक्र नोंदींवरून खरेदीदाराच्या विशिष्ट गुणवत्ता आणि कागदपत्रांच्या अटींची पडताळणी होत नाही.', sp_warning_constraint_recorded: 'पीकचक्राच्या एक किंवा अधिक पुरवठा मर्यादा नोंदवल्या आहेत; पुष्टीपूर्वी त्यांचा आढावा घ्या.',
  sp_include_candidate: 'समाविष्ट करा', sp_adjustment_reason: 'बदलाचे कारण आवश्यक आहे', sp_allocation_for: '{id} साठी प्रस्तावित वाटप', sp_adjustment_for: '{id} मधील बदलाचे कारण',
  sp_filter_all: 'सर्व स्थिती', sp_filter_status: 'योजनेची स्थिती', sp_reset_engine_proposal: 'इंजिनच्या प्रस्तावावर परत जा',
  sp_status_draft: 'मसुदा', sp_status_previewed: 'पूर्वावलोकन केले', sp_status_confirmed: 'पुष्टी झाली', sp_status_needs_review: 'पुनरावलोकन आवश्यक', sp_status_cancelled: 'रद्द',
} satisfies Partial<TranslationDictionary>

export default supplySafety
