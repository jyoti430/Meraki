"""Read-only public reference data; never authoritative farm or trade records.

Run: python -m uvicorn server.live_data:app --host 127.0.0.1 --port 8002
Only fixed provider URLs and allowlisted public reference points are accepted.
"""
from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import math
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


LOCATIONS = {
    'nashik': dict(id='nashik', name='Nashik reference centre', latitude=19.9975, longitude=73.7898, scope='public_reference'),
    'pune': dict(id='pune', name='Pune reference centre', latitude=18.5204, longitude=73.8567, scope='public_reference'),
    'satara': dict(id='satara', name='Satara reference centre', latitude=17.6805, longitude=74.0183, scope='public_reference'),
}
CROPS = {'tomato': dict(id='tomato', name='Tomato', code='08071'),
         'green_chilli': dict(id='green_chilli', name='Green chilli', code='10013')}
LANGS = ('en', 'ta', 'hi', 'ml', 'zh', 'ms')
DISPLAY = {
    'en': {'loc': {'nashik': 'Nashik reference point', 'pune': 'Pune reference point', 'satara': 'Satara reference point'}, 'crop': {'tomato': 'Tomato', 'green_chilli': 'Green chilli'},
           'fw': {'Public reference-point model forecast; not a farm sensor or guaranteed outcome.': 'Public reference-point model forecast; not a farm sensor or guaranteed outcome.', 'Provider issue time is not supplied by this endpoint; retrieval is conservative knowledge time.': 'Provider issue time is not supplied by this endpoint; retrieval is conservative knowledge time.', 'Open-Meteo free hosted API: non-commercial development only; commercial use requires suitable access terms.': 'Open-Meteo free hosted API: non-commercial development only; commercial use requires suitable access terms.'},
           'hw': {'Historical gridded model/assimilation estimates; not an individual farm observation or a forecast.': 'Historical gridded model/assimilation estimates; not an individual farm observation or a forecast.', 'Meteorology is approximately 0.5 x 0.625 degrees; a city reference point does not establish farm conditions.': 'Meteorology is approximately 0.5 x 0.625 degrees; a city reference point does not establish farm conditions.', 'Thirty requested days end seven days before today as a conservative latency buffer; later revisions remain possible.': 'Thirty requested days end seven days before today as a conservative latency buffer; later revisions remain possible.', 'Historical observations retrieved today were not necessarily available at their observation date.': 'Historical observations retrieved today were not necessarily available at their observation date.'},
           'mw': {'Statewide market observations are not buyer orders, farmgate offers or a forecast.': 'Statewide market observations are not buyer orders, farmgate offers or a forecast.', 'Source market/variety/unit labels are retained; no kg, grade or city matching is inferred.': 'Source market/variety/unit labels are retained; no kg, grade or city matching is inferred.', 'Public visibility does not establish unrestricted commercial reuse or model-training permission.': 'Public visibility does not establish unrestricted commercial reuse or model-training permission.'},
           'attr': {'Weather data by Open-Meteo.com; fields selected and normalised by Meraki.': 'Weather data by Open-Meteo.com; fields selected and normalised by Meraki.', 'NASA Langley Research Center POWER Project; selected daily fields normalised by Meraki.': 'NASA Langley Research Center POWER Project; selected daily fields normalised by Meraki.', 'Maharashtra State Agricultural Marketing Board public dated arrival and price report.': 'Maharashtra State Agricultural Marketing Board public dated arrival and price report.'},
           'lic': {'CC BY 4.0 data; free hosted API is restricted to non-commercial use.': 'CC BY 4.0 data; free hosted API is restricted to non-commercial use.', 'NASA POWER publicly accessible data; acknowledge the POWER Project.': 'NASA POWER publicly accessible data; acknowledge the POWER Project.', 'Public reference display; broader reuse, redistribution and training permissions have not been established.': 'Public reference display; broader reuse, redistribution and training permissions have not been established.'}},
    'ta': {'loc': {'nashik': 'நாசிக் குறிப்பு புள்ளி', 'pune': 'புனே குறிப்பு புள்ளி', 'satara': 'சதாரா குறிப்பு புள்ளி'}, 'crop': {'tomato': 'தக்காளி', 'green_chilli': 'பச்சை மிளகாய்'},
           'fw': {'Public reference-point model forecast; not a farm sensor or guaranteed outcome.': 'பொது குறிப்பு புள்ளி மாதிரி முன்னறிவிப்பு; இது பண்ணை சென்சார் அல்ல, உறுதியான முடிவல்ல.', 'Provider issue time is not supplied by this endpoint; retrieval is conservative knowledge time.': 'இந்த முனைப்புள்ளி வழங்குநர் வெளியீட்டு நேரத்தை வழங்கவில்லை; பெறப்பட்ட நேரமே பாதுகாப்பான அறிவு நேரம்.', 'Open-Meteo free hosted API: non-commercial development only; commercial use requires suitable access terms.': 'Open-Meteo இலவச API: வணிகமற்ற வளர்ச்சிக்கு மட்டும்; வணிக பயன்பாட்டிற்கு பொருத்தமான அணுகல் விதிகள் தேவை.'},
           'hw': {'Historical gridded model/assimilation estimates; not an individual farm observation or a forecast.': 'வரலாற்று கிரிட் மதிப்பீடுகள்; தனிப்பட்ட பண்ணை அளவீடு அல்லது முன்னறிவிப்பு அல்ல.', 'Meteorology is approximately 0.5 x 0.625 degrees; a city reference point does not establish farm conditions.': 'வானிலைத் தரவு சுமார் 0.5 x 0.625 டிகிரி கிரிட்; நகர குறிப்பு புள்ளி பண்ணை நிலையை உறுதிப்படுத்தாது.', 'Thirty requested days end seven days before today as a conservative latency buffer; later revisions remain possible.': 'கோரப்பட்ட 30 நாட்கள் இன்றைக்கு 7 நாட்களுக்கு முன் முடிகின்றன (தாமத இடைவெளி); பின்னர் திருத்தங்கள் சாத்தியம்.', 'Historical observations retrieved today were not necessarily available at their observation date.': 'இன்று பெறப்பட்ட வரலாற்றுத் தரவு அந்த தேதியிலேயே கிடைத்தது என்று பொருளல்ல.'},
           'mw': {'Statewide market observations are not buyer orders, farmgate offers or a forecast.': 'மாநில அளவிலான சந்தை பதிவுகள் வாங்குநர் ஆர்டர்கள், பண்ணை விலைகள் அல்லது முன்னறிவிப்பு அல்ல.', 'Source market/variety/unit labels are retained; no kg, grade or city matching is inferred.': 'மூல சந்தை/வகை/அலகு பெயர்கள் அப்படியே வைக்கப்பட்டுள்ளன; கிலோ, தரம் அல்லது நகர பொருத்தம் ஊகிக்கப்படவில்லை.', 'Public visibility does not establish unrestricted commercial reuse or model-training permission.': 'பொது காண்பிப்பு வரம்பற்ற வணிக மறுபயன்பாடு அல்லது மாதிரி பயிற்சி அனுமதியை உறுதிப்படுத்தாது.'},
           'attr': {'Weather data by Open-Meteo.com; fields selected and normalised by Meraki.': 'வானிலை தரவு: Open-Meteo.com; புலங்கள் Meraki-யால் தேர்வு/சீரமைக்கப்பட்டன.', 'NASA Langley Research Center POWER Project; selected daily fields normalised by Meraki.': 'NASA Langley Research Center POWER திட்டம்; தேர்ந்தெடுக்கப்பட்ட தினசரி புலங்கள் Meraki-யால் சீரமைக்கப்பட்டன.', 'Maharashtra State Agricultural Marketing Board public dated arrival and price report.': 'மகாராஷ்டிரா மாநில வேளாண் சந்தைப்படுத்தல் வாரியத்தின் பொது வருகை/விலை அறிக்கை.'},
           'lic': {'CC BY 4.0 data; free hosted API is restricted to non-commercial use.': 'CC BY 4.0 தரவு; இலவச API வணிகமற்ற பயன்பாட்டிற்கு மட்டும்.', 'NASA POWER publicly accessible data; acknowledge the POWER Project.': 'NASA POWER பொது தரவு; POWER திட்டத்தை குறிப்பிட வேண்டும்.', 'Public reference display; broader reuse, redistribution and training permissions have not been established.': 'பொது குறிப்பு காட்சி; விரிவான மறுபயன்பாடு/மறுவிநியோகம்/பயிற்சி அனுமதிகள் உறுதிப்படுத்தப்படவில்லை.'}},
    'hi': {'loc': {'nashik': 'नासिक संदर्भ बिंदु', 'pune': 'पुणे संदर्भ बिंदु', 'satara': 'सातारा संदर्भ बिंदु'}, 'crop': {'tomato': 'टमाटर', 'green_chilli': 'हरी मिर्च'},
           'fw': {'Public reference-point model forecast; not a farm sensor or guaranteed outcome.': 'सार्वजनिक संदर्भ-बिंदु मॉडल पूर्वानुमान; खेत सेंसर या निश्चित परिणाम नहीं।', 'Provider issue time is not supplied by this endpoint; retrieval is conservative knowledge time.': 'इस एंडपॉइंट पर प्रदाता का जारी समय नहीं दिया गया; प्राप्ति समय को ही ज्ञान समय माना गया है।', 'Open-Meteo free hosted API: non-commercial development only; commercial use requires suitable access terms.': 'Open-Meteo नि:शुल्क API: केवल गैर-वाणिज्यिक विकास; वाणिज्यिक उपयोग हेतु उपयुक्त शर्तें आवश्यक।'},
           'hw': {'Historical gridded model/assimilation estimates; not an individual farm observation or a forecast.': 'ऐतिहासिक ग्रिड मॉडल/अनुमान; व्यक्तिगत खेत माप या पूर्वानुमान नहीं।', 'Meteorology is approximately 0.5 x 0.625 degrees; a city reference point does not establish farm conditions.': 'मौसम डेटा लगभग 0.5 x 0.625 डिग्री ग्रिड का है; शहर संदर्भ बिंदु खेत की स्थिति सिद्ध नहीं करता।', 'Thirty requested days end seven days before today as a conservative latency buffer; later revisions remain possible.': 'माँगे गए 30 दिन आज से 7 दिन पहले समाप्त होते हैं (विलंब बफर); बाद में संशोधन संभव हैं।', 'Historical observations retrieved today were not necessarily available at their observation date.': 'आज प्राप्त ऐतिहासिक डेटा उस तिथि पर उपलब्ध रहा हो, यह आवश्यक नहीं।'},
           'mw': {'Statewide market observations are not buyer orders, farmgate offers or a forecast.': 'राज्य स्तरीय बाज़ार प्रेक्षण खरीदार ऑर्डर, खेत-दर प्रस्ताव या पूर्वानुमान नहीं हैं।', 'Source market/variety/unit labels are retained; no kg, grade or city matching is inferred.': 'स्रोत बाज़ार/किस्म/इकाई लेबल ज्यों के त्यों रखे गए; किलो, ग्रेड या शहर मिलान का अनुमान नहीं लगाया गया।', 'Public visibility does not establish unrestricted commercial reuse or model-training permission.': 'सार्वजनिक दृश्यता असीमित वाणिज्यिक पुन: उपयोग या मॉडल-प्रशिक्षण अनुमति सिद्ध नहीं करती।'},
           'attr': {'Weather data by Open-Meteo.com; fields selected and normalised by Meraki.': 'मौसम डेटा: Open-Meteo.com; फ़ील्ड Meraki द्वारा चयनित व सामान्यीकृत।', 'NASA Langley Research Center POWER Project; selected daily fields normalised by Meraki.': 'NASA Langley Research Center POWER प्रोजेक्ट; चयनित दैनिक फ़ील्ड Meraki द्वारा सामान्यीकृत।', 'Maharashtra State Agricultural Marketing Board public dated arrival and price report.': 'महाराष्ट्र राज्य कृषि विपणन बोर्ड की सार्वजनिक आगमन व मूल्य रिपोर्ट।'},
           'lic': {'CC BY 4.0 data; free hosted API is restricted to non-commercial use.': 'CC BY 4.0 डेटा; नि:शुल्क API केवल गैर-वाणिज्यिक उपयोग हेतु।', 'NASA POWER publicly accessible data; acknowledge the POWER Project.': 'NASA POWER सार्वजनिक डेटा; POWER प्रोजेक्ट का उल्लेख आवश्यक।', 'Public reference display; broader reuse, redistribution and training permissions have not been established.': 'सार्वजनिक संदर्भ प्रदर्शन; व्यापक पुन: उपयोग/पुनर्वितरण/प्रशिक्षण अनुमति स्थापित नहीं।'}},
    'ml': {'loc': {'nashik': 'നാസിക് റഫറൻസ് പോയിന്റ്', 'pune': 'പൂനെ റഫറൻസ് പോയിന്റ്', 'satara': 'സതാര റഫറൻസ് പോയിന്റ്'}, 'crop': {'tomato': 'തക്കാളി', 'green_chilli': 'പച്ചമുളക്'},
           'fw': {'Public reference-point model forecast; not a farm sensor or guaranteed outcome.': 'പൊതു റഫറൻസ് പോയിന്റ് മോഡൽ പ്രവചനം; കൃഷിയിട സെൻസറോ ഉറപ്പായ ഫലമോ അല്ല.', 'Provider issue time is not supplied by this endpoint; retrieval is conservative knowledge time.': 'ഈ എൻഡ്‌പോയിന്റ് നൽകുന്ന സമയമാണ് ഉപയോഗിച്ചത്; ദാതാവിന്റെ പ്രസിദ്ധീകരണ സമയം ലഭ്യമല്ല.', 'Open-Meteo free hosted API: non-commercial development only; commercial use requires suitable access terms.': 'Open-Meteo സൗജന്യ API: വാണിജ്യേതര വികസനത്തിന് മാത്രം; വാണിജ്യ ഉപയോഗത്തിന് അനുയോജ്യമായ നിബന്ധനകൾ വേണം.'},
           'hw': {'Historical gridded model/assimilation estimates; not an individual farm observation or a forecast.': 'ചരിത്ര ഗ്രിഡ് മോഡൽ കണക്കുകൾ; വ്യക്തിഗത കൃഷിയിട നിരീക്ഷണമോ പ്രവചനമോ അല്ല.', 'Meteorology is approximately 0.5 x 0.625 degrees; a city reference point does not establish farm conditions.': 'കാലാവസ്ഥാ ഡാറ്റ ഏകദേശം 0.5 x 0.625 ഡിഗ്രി ഗ്രിഡ് ആണ്; നഗര റഫറൻസ് പോയിന്റ് കൃഷിയിട സ്ഥിതി തെളിയിക്കുന്നില്ല.', 'Thirty requested days end seven days before today as a conservative latency buffer; later revisions remain possible.': 'അഭ്യർത്ഥിച്ച 30 ദിവസം ഇന്നിന് 7 ദിവസം മുമ്പ് അവസാനിക്കുന്നു (കാലതാമസ ബഫർ); പിന്നീട് തിരുത്തലുകൾ സാധ്യമാണ്.', 'Historical observations retrieved today were not necessarily available at their observation date.': 'ഇന്ന് ലഭിച്ച ചരിത്ര ഡാറ്റ ആ തീയതിയിൽ തന്നെ ലഭ്യമായിരുന്നു എന്ന് അർത്ഥമില്ല.'},
           'mw': {'Statewide market observations are not buyer orders, farmgate offers or a forecast.': 'സംസ്ഥാനതല വിപണി നിരീക്ഷണങ്ങൾ വാങ്ങുന്നവരുടെ ഓർഡറുകളോ ഫാംഗേറ്റ് വിലകളോ പ്രവചനമോ അല്ല.', 'Source market/variety/unit labels are retained; no kg, grade or city matching is inferred.': 'സ്രോതസ് വിപണി/ഇനം/യൂണിറ്റ് ലേബലുകൾ അതേപടി സൂക്ഷിച്ചു; കിലോ/ഗ്രേഡ്/നഗരം പൊരുത്തപ്പെടുത്തൽ അനുമാനിച്ചിട്ടില്ല.', 'Public visibility does not establish unrestricted commercial reuse or model-training permission.': 'പൊതു ദൃശ്യത പരിധിയില്ലാത്ത വാണിജ്യ പുനരുപയോഗം അല്ലെങ്കിൽ മോഡൽ പരിശീലന അനുമതി തെളിയിക്കുന്നില്ല.'},
           'attr': {'Weather data by Open-Meteo.com; fields selected and normalised by Meraki.': 'കാലാവസ്ഥാ ഡാറ്റ: Open-Meteo.com; ഫീൽഡുകൾ Meraki തിരഞ്ഞെടുത്ത് ക്രമീകരിച്ചത്.', 'NASA Langley Research Center POWER Project; selected daily fields normalised by Meraki.': 'NASA Langley Research Center POWER പദ്ധതി; തിരഞ്ഞെടുത്ത ദൈനംദിന ഫീൽഡുകൾ Meraki ക്രമീകരിച്ചത്.', 'Maharashtra State Agricultural Marketing Board public dated arrival and price report.': 'മഹാരാഷ്ട്ര സംസ്ഥാന കാർഷിക വിപണന ബോർഡിന്റെ പൊതു വരവ്/വില റിപ്പോർട്ട്.'},
           'lic': {'CC BY 4.0 data; free hosted API is restricted to non-commercial use.': 'CC BY 4.0 ഡാറ്റ; സൗജന്യ API വാണിജ്യേതര ഉപയോഗത്തിന് മാത്രം.', 'NASA POWER publicly accessible data; acknowledge the POWER Project.': 'NASA POWER പൊതു ഡാറ്റ; POWER പദ്ധതിയെ പരാമർശിക്കണം.', 'Public reference display; broader reuse, redistribution and training permissions have not been established.': 'പൊതു റഫറൻസ് പ്രദർശനം; വിപുലമായ പുനരുപയോഗ/വിതരണ/പരിശീലന അനുമതികൾ സ്ഥിരീകരിച്ചിട്ടില്ല.'}},
    'zh': {'loc': {'nashik': '纳西克参考点', 'pune': '浦那参考点', 'satara': '萨塔拉参考点'}, 'crop': {'tomato': '番茄', 'green_chilli': '青辣椒'},
           'fw': {'Public reference-point model forecast; not a farm sensor or guaranteed outcome.': '公共参考点模型预报；并非农场传感器读数或保证结果。', 'Provider issue time is not supplied by this endpoint; retrieval is conservative knowledge time.': '该接口未提供提供方发布时间；检索时间为保守认知时间。', 'Open-Meteo free hosted API: non-commercial development only; commercial use requires suitable access terms.': 'Open-Meteo 免费托管 API：仅限非商业开发；商业使用需合适的访问条款。'},
           'hw': {'Historical gridded model/assimilation estimates; not an individual farm observation or a forecast.': '历史网格模型/同化估算；并非单个农场观测或预报。', 'Meteorology is approximately 0.5 x 0.625 degrees; a city reference point does not establish farm conditions.': '气象数据约 0.5 x 0.625 度网格；城市参考点不能证明农场状况。', 'Thirty requested days end seven days before today as a conservative latency buffer; later revisions remain possible.': '所请求的30天在今天前7天结束（保守延迟缓冲）；后续仍可能修订。', 'Historical observations retrieved today were not necessarily available at their observation date.': '今天获取的历史数据不一定在观测当日即可获得。'},
           'mw': {'Statewide market observations are not buyer orders, farmgate offers or a forecast.': '全州市场观测并非买方订单、农场出售价或预测。', 'Source market/variety/unit labels are retained; no kg, grade or city matching is inferred.': '保留来源市场/品种/单位标签；未推断公斤、等级或城市匹配。', 'Public visibility does not establish unrestricted commercial reuse or model-training permission.': '公开可见并不等同于无限制商业再利用或模型训练许可。'},
           'attr': {'Weather data by Open-Meteo.com; fields selected and normalised by Meraki.': '天气数据：Open-Meteo.com；字段由 Meraki 选择并规范化。', 'NASA Langley Research Center POWER Project; selected daily fields normalised by Meraki.': 'NASA Langley Research Center POWER 项目；所选日字段由 Meraki 规范化。', 'Maharashtra State Agricultural Marketing Board public dated arrival and price report.': '马哈拉施特拉邦农业营销委员会公开到货与价格报告。'},
           'lic': {'CC BY 4.0 data; free hosted API is restricted to non-commercial use.': 'CC BY 4.0 数据；免费托管 API 仅限非商业用途。', 'NASA POWER publicly accessible data; acknowledge the POWER Project.': 'NASA POWER 公开数据；需注明 POWER 项目。', 'Public reference display; broader reuse, redistribution and training permissions have not been established.': '公共参考展示；更广泛的再利用/再分发/训练许可尚未确认。'}},
    'ms': {'loc': {'nashik': 'Titik rujukan Nashik', 'pune': 'Titik rujukan Pune', 'satara': 'Titik rujukan Satara'}, 'crop': {'tomato': 'Tomato', 'green_chilli': 'Cili hijau'},
           'fw': {'Public reference-point model forecast; not a farm sensor or guaranteed outcome.': 'Ramalan model titik rujukan awam; bukan sensor ladang atau hasil terjamin.', 'Provider issue time is not supplied by this endpoint; retrieval is conservative knowledge time.': 'Masa terbitan pembekal tidak dibekalkan; masa dapatan digunakan sebagai masa pengetahuan konservatif.', 'Open-Meteo free hosted API: non-commercial development only; commercial use requires suitable access terms.': 'API hos percuma Open-Meteo: untuk pembangunan bukan komersial sahaja; penggunaan komersial memerlukan terma akses sesuai.'},
           'hw': {'Historical gridded model/assimilation estimates; not an individual farm observation or a forecast.': 'Anggaran model grid sejarah; bukan cerapan ladang individu atau ramalan.', 'Meteorology is approximately 0.5 x 0.625 degrees; a city reference point does not establish farm conditions.': 'Meteorologi kira-kira grid 0.5 x 0.625 darjah; titik rujukan bandar tidak membuktikan keadaan ladang.', 'Thirty requested days end seven days before today as a conservative latency buffer; later revisions remain possible.': '30 hari diminta berakhir 7 hari sebelum hari ini (penampan lengah); semakan kemudian masih mungkin.', 'Historical observations retrieved today were not necessarily available at their observation date.': 'Cerapan sejarah yang diperoleh hari ini tidak semestinya tersedia pada tarikh cerapan.'},
           'mw': {'Statewide market observations are not buyer orders, farmgate offers or a forecast.': 'Cerapan pasaran seluruh negeri bukan pesanan pembeli, tawaran ladang atau ramalan.', 'Source market/variety/unit labels are retained; no kg, grade or city matching is inferred.': 'Label pasaran/varieti/unit sumber dikekalkan; tiada padanan kg, gred atau bandar disimpulkan.', 'Public visibility does not establish unrestricted commercial reuse or model-training permission.': 'Keterlihatan awam tidak mewujudkan kebenaran guna semula komersial atau latihan model tanpa had.'},
           'attr': {'Weather data by Open-Meteo.com; fields selected and normalised by Meraki.': 'Data cuaca oleh Open-Meteo.com; medan dipilih dan dinormalkan oleh Meraki.', 'NASA Langley Research Center POWER Project; selected daily fields normalised by Meraki.': 'Projek NASA Langley Research Center POWER; medan harian terpilih dinormalkan oleh Meraki.', 'Maharashtra State Agricultural Marketing Board public dated arrival and price report.': 'Laporan ketibaan dan harga awam bertarikh Lembaga Pemasaran Pertanian Negeri Maharashtra.'},
           'lic': {'CC BY 4.0 data; free hosted API is restricted to non-commercial use.': 'Data CC BY 4.0; API hos percuma terhad kepada penggunaan bukan komersial.', 'NASA POWER publicly accessible data; acknowledge the POWER Project.': 'Data awam NASA POWER; akui Projek POWER.', 'Public reference display; broader reuse, redistribution and training permissions have not been established.': 'Paparan rujukan awam; kebenaran guna semula/pengedaran/latihan lebih luas belum ditetapkan.'}},
}

def localize_lang(lang):
    return lang if lang in DISPLAY else 'en'

def localize_warning(kind, warning, lang):
    if warning.startswith('Refresh failed: returning explicitly stale previously retrieved public observations.'):
        prefix = {'en':'Refresh failed: returning explicitly stale previously retrieved public observations.','ta':'புதுப்பிப்பு தோல்வி: முன்பு பெறப்பட்ட பொது தரவு பழையது எனக் காட்டப்படுகிறது.','hi':'रीफ्रेश विफल: पहले प्राप्त सार्वजनिक डेटा स्पष्ट रूप से पुराना दिखाया जा रहा है।','ml':'പുതുക്കൽ പരാജയപ്പെട്ടു: മുമ്പ് ലഭിച്ച പൊതു ഡാറ്റ പഴകിയതാണെന്ന് വ്യക്തമാക്കുന്നു.','zh':'刷新失败：返回之前获取的已明确标记为过时的公共观测数据。','ms':'Muat semula gagal: memaparkan cerapan awam yang diperoleh sebelum ini sebagai lapuk.'}[localize_lang(lang)]
        return prefix
    if warning.startswith('Latest market observation is ') and warning.endswith(' calendar days old; retrieval does not make its price current.'):
        try:
            age = warning.split('Latest market observation is ', 1)[1].split(' ', 1)[0]
            return {'en': warning,'ta': f'சமீபத்திய சந்தை பதிவு {age} நாட்கள் பழையது; மீட்டெடுப்பது விலையை தற்போதையதாக்காது.','hi': f'नवीनतम बाज़ार प्रेक्षण {age} दिन पुराना है; प्राप्ति से कीमत वर्तमान नहीं होती।','ml': f'ഏറ്റവും പുതിയ വിപണി നിരീക്ഷണം {age} ദിവസം പഴക്കമുള്ളതാണ്; വീണ്ടും ലഭ്യമാക്കുന്നത് വില നിലവിലേതാക്കില്ല.','zh': f'最新市场观测已过去 {age} 个日历日；检索不会使价格变为当前值。','ms': f'Cerapan pasaran terkini berusia {age} hari kalendar; dapatan tidak menjadikan harga semasa.'}[localize_lang(lang)]
        except Exception:
            pass
    if ' measurements are missing; null values were preserved without imputation.' in warning:
        try:
            count = warning.split(' ', 1)[0]
            return {'en': warning,'ta': f'{count} அளவீடுகள் இல்லை; மதிப்புகள் கணிக்கப்படாமல் null ஆக வைக்கப்பட்டுள்ளன.','hi': f'{count} माप अनुपलब्ध हैं; मानों का अनुमान लगाए बिना null रखा गया है।','ml': f'{count} അളവുകൾ ലഭ്യമല്ല; അനുമാനമില്ലാതെ null ആയി സൂക്ഷിച്ചു.','zh': f'{count} 项测量缺失；已保留空值，未进行插补。','ms': f'{count} ukuran tiada; nilai null dikekalkan tanpa anggaran.'}[localize_lang(lang)]
        except Exception:
            pass
    d = DISPLAY[localize_lang(lang)]
    key = {'forecast':'fw','history':'hw','market':'mw'}.get(kind, 'fw')
    return d[key].get(warning, warning)

def localize_error(err, lang):
    if err is None: return None
    l = localize_lang(lang)
    code = err.get('code'); msg = err.get('message', '')
    msgs = {
        'upstream_http': {'en': msg,'ta':'வழங்குநர் HTTP பிழையை திருப்பியது; மாற்று தரவு உருவாக்கப்படவில்லை.','hi':'प्रदाता ने HTTP त्रुटि लौटाई; कोई वैकल्पिक डेटा नहीं बनाया गया।','ml':'ദാതാവ് HTTP പിശക് നൽകി; പകരം ഡാറ്റ സൃഷ്ടിച്ചിട്ടില്ല.','zh':'提供方返回 HTTP 错误；未生成替代数据。','ms':'Pembekal memulangkan ralat HTTP; tiada data gantian dicipta.'},
        'response_too_large': {'en':'Provider response exceeded the bounded response size.','ta':'வழங்குநர் பதில் அனுமதிக்கப்பட்ட அளவை மீறியது.','hi':'प्रदाता की प्रतिक्रिया अनुमत आकार से बड़ी है।','ml':'ദാതാവിന്റെ പ്രതികരണം അനുവദനീയ വലുപ്പം കവിഞ്ഞു.','zh':'提供方响应超出允许大小。','ms':'Respons pembekal melebihi saiz yang dibenarkan.'},
        'timeout': {'en':'Provider request exceeded the bounded timeout.','ta':'வழங்குநர் கோரிக்கை நேர வரம்பை மீறியது.','hi':'प्रदाता अनुरोध का समय सीमा पार हो गई।','ml':'ദാതൃ അഭ്യർത്ഥന സമയപരിധി കവിഞ്ഞു.','zh':'提供方请求超时。','ms':'Permintaan pembekal melebihi had masa.'},
        'network_error': {'en':'Provider could not be reached; no replacement observations were invented.','ta':'வழங்குநரை அணுக முடியவில்லை; மாற்று தரவு உருவாக்கப்படவில்லை.','hi':'प्रदाता तक पहुँचा नहीं जा सका; कोई वैकल्पिक डेटा नहीं बनाया गया।','ml':'ദാതാവിനെ സമീപിക്കാനായില്ല; പകരം ഡാറ്റ സൃഷ്ടിച്ചിട്ടില്ല.','zh':'无法连接提供方；未生成替代观测数据。','ms':'Pembekal tidak dapat dihubungi; tiada cerapan gantian dicipta.'},
        'schema_invalid': {'en':'Provider response did not match the expected bounded schema.','ta':'வழங்குநர் பதில் எதிர்பார்க்கப்பட்ட வடிவத்துடன் பொருந்தவில்லை.','hi':'प्रदाता प्रतिक्रिया अपेक्षित संरचना से मेल नहीं खाती।','ml':'ദാതാവിന്റെ പ്രതികരണം പ്രതീക്ഷിച്ച ഘടനയുമായി പൊരുത്തപ്പെടുന്നില്ല.','zh':'提供方响应与预期结构不匹配。','ms':'Respons pembekal tidak sepadan dengan skema yang dijangka.'},
    }
    return dict(code=code, message=msgs.get(code, {}).get(l, msg))

def localize_display(kind, envelope, lang):
    l = localize_lang(lang)
    d = DISPLAY[l]
    warnings = [localize_warning(kind, w, l) for w in envelope.get('warnings', [])]
    attr = d['attr'].get(envelope.get('attribution', ''), envelope.get('attribution', ''))
    lic = d['lic'].get(envelope.get('licence', ''), envelope.get('licence', ''))
    loc = envelope.get('location')
    if loc and isinstance(loc, dict) and loc.get('id') in d['loc']:
        loc = {**loc, 'name': d['loc'][loc['id']]}
    return {**envelope, 'location': loc, 'warnings': warnings, 'attribution': attr, 'licence': lic, 'error': localize_error(envelope.get('error'), l), 'display_lang': l}
WEATHER_FIELDS = {'temperature_2m_min': ('t2m_min_c', '°C', -90, 65),
                  'temperature_2m_max': ('t2m_max_c', '°C', -90, 65),
                  'precipitation_sum': ('precipitation_mm_day', 'mm', 0, 2000),
                  'et0_fao_evapotranspiration': ('et0_mm_day', 'mm', 0, 100)}
POWER_FIELDS = {'T2M_MIN': ('t2m_min_c', 'C', -90, 65),
                'T2M_MAX': ('t2m_max_c', 'C', -90, 65),
                'PRECTOTCORR': ('precipitation_mm_day', 'mm/day', 0, 2000)}
SOURCES = {
    'forecast': dict(source_id='open-meteo-forecast', source_name='Open-Meteo',
        source_url='https://api.open-meteo.com/v1/forecast', documentation_url='https://open-meteo.com/en/docs',
        attribution='Weather data by Open-Meteo.com; fields selected and normalised by Meraki.',
        licence='CC BY 4.0 data; free hosted API is restricted to non-commercial use.', data_kind='forecast',
        ttl=900, stale_limit=21600,
        warnings=['Public reference-point model forecast; not a farm sensor or guaranteed outcome.',
                  'Provider issue time is not supplied by this endpoint; retrieval is conservative knowledge time.',
                  'Open-Meteo free hosted API: non-commercial development only; commercial use requires suitable access terms.']),
    'history': dict(source_id='nasa-power-daily', source_name='NASA POWER',
        source_url='https://power.larc.nasa.gov/api/temporal/daily/point',
        documentation_url='https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
        attribution='NASA Langley Research Center POWER Project; selected daily fields normalised by Meraki.',
        licence='NASA POWER publicly accessible data; acknowledge the POWER Project.', data_kind='gridded_historical_estimate',
        ttl=21600, stale_limit=604800,
        warnings=['Historical gridded model/assimilation estimates; not an individual farm observation or a forecast.',
                  'Meteorology is approximately 0.5 x 0.625 degrees; a city reference point does not establish farm conditions.',
                  'Thirty requested days end seven days before today as a conservative latency buffer; later revisions remain possible.',
                  'Historical observations retrieved today were not necessarily available at their observation date.']),
    'market': dict(source_id='msamb-latest-report', source_name='MSAMB public APMC report',
        source_url='https://www.msamb.com/ApmcDetail/DataGridBind',
        documentation_url='https://www.msamb.com/ApmcDetail/APMCPriceInformation',
        attribution='Maharashtra State Agricultural Marketing Board public dated arrival and price report.',
        licence='Public reference display; broader reuse, redistribution and training permissions have not been established.',
        data_kind='market_observation', ttl=1800, stale_limit=259200,
        warnings=['Statewide market observations are not buyer orders, farmgate offers or a forecast.',
                  'Source market/variety/unit labels are retained; no kg, grade or city matching is inferred.',
                  'Public visibility does not establish unrestricted commercial reuse or model-training permission.']),
}


class SourceError(Exception):
    def __init__(self, code, message):
        self.code = code
        self.message = message
        super().__init__(message)


def check(condition, message):
    if not condition:
        raise SourceError('schema_invalid', message)


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def numeric(value, minimum, maximum, *, fill_value=None):
    if value is None or (fill_value is not None and type(value) in (int, float) and value == fill_value):
        return None
    check(type(value) in (int, float), 'Provider returned a nonnumeric measurement.')
    check(minimum <= value <= maximum, 'Provider measurement is outside the accepted physical/schema bounds.')
    check(math.isfinite(value), 'Provider returned a nonfinite measurement.')
    return float(value)


def dates_between(start, end):
    return [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]


def valid_temperatures(rows):
    for row in rows:
        if row['t2m_min_c'] is not None and row['t2m_max_c'] is not None:
            check(row['t2m_min_c'] <= row['t2m_max_c'], 'Provider temperature minimum exceeds maximum.')


class ReportParser(HTMLParser):
    """Parse fixed public MSAMB seven-cell rows, without evaluating page code."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.cells = []
        self.parts = []
        self.in_cell = False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.cells = []
        elif tag in ('td', 'th'):
            self.parts = []
            self.in_cell = True

    def handle_data(self, data):
        if self.in_cell:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.in_cell:
            self.cells.append(' '.join(''.join(self.parts).split()))
            self.in_cell = False
        elif tag == 'tr' and self.cells:
            check(len(self.rows) < 5000, 'MSAMB returned too many table rows.')
            self.rows.append(self.cells)


def market_number(value):
    if value.strip() in ('', '-', '--', '---', '—', 'NA', 'N/A'):
        return None
    try:
        number = float(value.replace(',', ''))
    except (ValueError, AttributeError):
        raise SourceError('schema_invalid', 'MSAMB returned an unrecognised numeric cell.')
    return numeric(number, 0, 1e10)


class PublicDataGateway:
    def __init__(self, client, clock, request_timeout_seconds=15, max_response_bytes=600000):
        self.client = client
        self.clock = clock
        self.timeout = request_timeout_seconds
        self.max_bytes = max_response_bytes
        self.cache = {}
        self.locks = {}

    def now(self):
        now = self.clock()
        if not isinstance(now, datetime) or now.tzinfo is None:
            raise RuntimeError('The gateway server clock must include a timezone.')
        return now.astimezone(timezone.utc)

    def period(self, kind):
        if kind == 'forecast':
            start = self.now().astimezone(ZoneInfo('Asia/Kolkata')).date()
            return start, start + timedelta(days=6)
        if kind == 'history':
            end = self.now().date() - timedelta(days=7)
            return end - timedelta(days=29), end
        return None, None

    def envelope(self, kind, location):
        source = SOURCES[kind]
        loc = copy.deepcopy(location)
        if isinstance(loc, dict) and loc.get('id') in LOCATIONS:
            loc = {**loc, 'name': LOCATIONS[loc['id']]['name']}
        return {**{key: source[key] for key in ('source_id', 'source_name', 'source_url', 'documentation_url',
                 'attribution', 'licence', 'data_kind')},
            'status': 'error', 'synthetic': False, 'location': loc,
            'time_basis': 'UTC' if kind == 'history' else 'Asia/Kolkata',
            'retrieved_at': None, 'available_at': None, 'provider_issued_at': None,
            'attempted_at': iso(self.now()), 'observation_start': None, 'observation_end': None,
            'cache': dict(hit=False, ttl_seconds=source['ttl'], expires_at=None),
            'warnings': copy.deepcopy(source['warnings']), 'error': None, 'units': {}, 'data': [], 'payload_sha256': None}

    async def download(self, url, params, *, headers=None):
        try:
            async with asyncio.timeout(self.timeout):
                async with self.client.stream('GET', url, params=params, headers=headers) as response:
                    if response.status_code != 200:
                        raise SourceError('upstream_http', f'Provider returned HTTP {response.status_code}; no replacement observations were invented.')
                    content_length = response.headers.get('content-length')
                    if content_length is not None:
                        try:
                            check(int(content_length) >= 0, 'Provider content length is invalid.')
                            if int(content_length) > self.max_bytes:
                                raise SourceError('response_too_large', 'Provider response exceeded the bounded response size.')
                        except ValueError:
                            raise SourceError('schema_invalid', 'Provider content length is invalid.')
                    chunks = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(chunks) + len(chunk) > self.max_bytes:
                            raise SourceError('response_too_large', 'Provider response exceeded the bounded response size.')
                        chunks.extend(chunk)
                    return bytes(chunks), str(response.url)
        except (TimeoutError, httpx.TimeoutException):
            raise SourceError('timeout', 'Provider request exceeded the bounded timeout.')
        except httpx.RequestError:
            raise SourceError('network_error', 'Provider could not be reached; no replacement observations were invented.')

    def parse_forecast(self, payload, location, start, end):
        check(isinstance(payload, dict), 'Forecast response must be an object.')
        latitude = numeric(payload.get('latitude'), -90, 90)
        longitude = numeric(payload.get('longitude'), -180, 180)
        check(latitude is not None and longitude is not None and abs(latitude - location['latitude']) <= .5 and abs(longitude - location['longitude']) <= .5,
              'Forecast grid coordinates do not match the requested reference region.')
        check(payload.get('timezone') == 'Asia/Kolkata', 'Forecast timezone does not match the requested daily basis.')
        daily, units = payload.get('daily'), payload.get('daily_units')
        check(isinstance(daily, dict) and isinstance(units, dict), 'Forecast daily values/units are missing.')
        expected = dates_between(start, end)
        check(daily.get('time') == expected, 'Forecast dates are incomplete, duplicated or outside the requested seven days.')
        check(units.get('time') == 'iso8601', 'Forecast time unit changed.')
        rows = [dict(date=day) for day in expected]
        for field, (output, unit, minimum, maximum) in WEATHER_FIELDS.items():
            check(units.get(field) == unit, 'Forecast measurement units changed.')
            values = daily.get(field)
            check(isinstance(values, list) and len(values) == 7, 'Forecast arrays do not align with dates.')
            for row, value in zip(rows, values):
                row[output] = numeric(value, minimum, maximum)
        valid_temperatures(rows)
        return rows, dict(date='Asia/Kolkata calendar date', t2m_min_c='degC', t2m_max_c='degC', precipitation_mm_day='mm/day', et0_mm_day='mm/day')

    def parse_history(self, payload, location, start, end):
        check(isinstance(payload, dict), 'POWER response must be an object.')
        header = payload.get('header')
        check(isinstance(header, dict) and header.get('start') == start.strftime('%Y%m%d') and header.get('end') == end.strftime('%Y%m%d'),
              'POWER response period does not match the requested historical period.')
        check(header.get('time_standard') == 'UTC', 'POWER response is not on the requested UTC daily basis.')
        fill = numeric(header.get('fill_value'), -100000, -100)
        check(fill is not None, 'POWER missing-value sentinel is absent.')
        geometry = payload.get('geometry')
        check(isinstance(geometry, dict) and isinstance(geometry.get('coordinates'), list) and len(geometry['coordinates']) >= 2,
              'POWER point geometry is missing.')
        longitude = numeric(geometry['coordinates'][0], -180, 180)
        latitude = numeric(geometry['coordinates'][1], -90, 90)
        check(longitude is not None and latitude is not None and abs(longitude - location['longitude']) <= 1 and abs(latitude - location['latitude']) <= 1,
              'POWER grid does not cover the requested reference region.')
        descriptions = payload.get('parameters')
        properties = payload.get('properties')
        check(isinstance(descriptions, dict) and isinstance(properties, dict) and isinstance(properties.get('parameter'), dict), 'POWER parameter schema is missing.')
        values = properties['parameter']
        check(set(values) == set(POWER_FIELDS), 'POWER did not return exactly the requested parameters.')
        expected = dates_between(start, end)
        keys = [day.replace('-', '') for day in expected]
        rows = [dict(date=day) for day in expected]
        for field, (output, unit, minimum, maximum) in POWER_FIELDS.items():
            check(isinstance(descriptions.get(field), dict) and descriptions[field].get('units') == unit, 'POWER measurement units changed.')
            check(isinstance(values[field], dict) and set(values[field]) == set(keys), 'POWER dates are incomplete or outside the requested period.')
            for row, day in zip(rows, keys):
                row[output] = numeric(values[field][day], minimum, maximum, fill_value=fill)
        valid_temperatures(rows)
        return rows, dict(date='UTC calendar date', t2m_min_c='degC', t2m_max_c='degC', precipitation_mm_day='mm/day')

    def parse_market(self, raw, crop):
        parser = ReportParser()
        parser.feed(raw.decode('utf-8-sig', errors='strict'))
        day = None
        records = []
        today = self.now().astimezone(ZoneInfo('Asia/Kolkata')).date()
        for cells in parser.rows:
            if len(cells) == 1:
                day = None
                try:
                    day = datetime.strptime(cells[0], '%d/%m/%Y').date()
                except ValueError:
                    continue
                check(day <= today, 'MSAMB reported an observation in the future.')
            elif len(cells) == 7:
                # A changed header cannot quietly become an invented record.
                check(day is not None, 'MSAMB row lacks an explicit observation date.')
                check(0 < len(cells[0]) <= 300 and 0 < len(cells[2]) <= 100, 'MSAMB market/unit label is missing or oversized.')
                low, high, modal = [market_number(value) for value in cells[4:7]]
                if low is not None and high is not None:
                    check(low <= high, 'MSAMB minimum price exceeds maximum.')
                if modal is not None and low is not None and high is not None:
                    check(low <= modal <= high, 'MSAMB modal price is outside the stated range.')
                records.append(dict(observation_date=day.isoformat(), market=cells[0], commodity=CROPS[crop]['name'],
                    variety=None if not cells[1].strip('-— ') else cells[1], grade=None,
                    price_min_rs_per_unit=low, price_max_rs_per_unit=high, price_modal_rs_per_unit=modal,
                    price_unit=cells[2], arrivals_value=market_number(cells[3]), arrivals_unit=cells[2]))
            else:
                raise SourceError('schema_invalid', 'MSAMB table row shape changed.')
        check(records, 'MSAMB returned no parseable dated market observations.')
        latest = max(row['observation_date'] for row in records)
        rows = [row for row in records if row['observation_date'] == latest]
        check(len(rows) <= 500, 'MSAMB latest report exceeds the bounded observation count.')
        return rows, dict(prices='INR per source unit (row.price_unit)', arrivals='source unit (row.arrivals_unit)')

    async def fetch(self, kind, reference, start, end):
        location = LOCATIONS[reference] if kind != 'market' else None
        envelope = self.envelope(kind, location)
        if kind == 'forecast':
            params = dict(latitude=location['latitude'], longitude=location['longitude'],
                daily=','.join(WEATHER_FIELDS), timezone='Asia/Kolkata', forecast_days=7, temperature_unit='celsius', precipitation_unit='mm')
            raw, source_url = await self.download(SOURCES[kind]['source_url'], params)
            rows, units = self.parse_forecast(json.loads(raw), location, start, end)
        elif kind == 'history':
            params = dict(latitude=location['latitude'], longitude=location['longitude'],
                parameters=','.join(POWER_FIELDS), community='AG', start=start.strftime('%Y%m%d'), end=end.strftime('%Y%m%d'),
                format='JSON', **{'time-standard': 'UTC'})
            raw, source_url = await self.download(SOURCES[kind]['source_url'], params)
            rows, units = self.parse_history(json.loads(raw), location, start, end)
        else:
            params = dict(commodityCode=CROPS[reference]['code'], apmcCode='null')
            raw, source_url = await self.download(SOURCES[kind]['source_url'], params, headers={
                'X-Requested-With': 'XMLHttpRequest', 'Referer': SOURCES[kind]['documentation_url']})
            rows, units = self.parse_market(raw, reference)
        retrieved_at = iso(self.now())
        missing = sum(value is None for row in rows for key, value in row.items()
                      if key not in ('grade', 'variety') and (key.endswith('_c') or key.endswith('_day') or key in ('price_min_rs_per_unit', 'price_max_rs_per_unit', 'price_modal_rs_per_unit', 'arrivals_value')))
        if missing:
            envelope['warnings'].append(f'{missing} measurements are missing; null values were preserved without imputation.')
        observation_dates = [row['observation_date'] if kind == 'market' else row['date'] for row in rows]
        envelope.update(status='partial' if missing else 'ok', source_url=source_url, retrieved_at=retrieved_at,
            available_at=retrieved_at, observation_start=min(observation_dates), observation_end=max(observation_dates),
            data=rows, units=units, payload_sha256=hashlib.sha256(raw).hexdigest())
        if kind == 'market':
            age = (self.now().astimezone(ZoneInfo('Asia/Kolkata')).date() - date.fromisoformat(envelope['observation_end'])).days
            if age > 3:
                envelope['status'] = 'stale'
                envelope['warnings'].append(f'Latest market observation is {age} calendar days old; retrieval does not make its price current.')
        return envelope

    async def get(self, kind, reference, lang='en'):
        key = (kind, reference)
        start, end = self.period(kind)
        signature = (start, end)
        lock = self.locks.setdefault(key, asyncio.Lock())
        async with lock:
            previous = self.cache.get(key)
            if previous and previous['period'] == signature and self.now() < previous['expires_at']:
                value = copy.deepcopy(previous['value'])
                value['cache']['hit'] = True
                return localize_display(kind, value, lang)
            source = SOURCES[kind]
            ttl = source['ttl']
            try:
                value = await self.fetch(kind, reference, start, end)
            except (SourceError, ValueError, TypeError, KeyError, UnicodeError, RecursionError) as error:
                failure = error if isinstance(error, SourceError) else SourceError('schema_invalid', 'Provider response did not match the expected bounded schema.')
                now = self.now()
                if previous and previous['period'] == signature and previous['value']['data'] and (
                    now - datetime.fromisoformat(previous['value']['retrieved_at'].replace('Z', '+00:00'))).total_seconds() <= source['stale_limit']:
                    value = copy.deepcopy(previous['value'])
                    value['status'] = 'stale'
                    value['warnings'] = [warning for warning in value['warnings'] if not warning.startswith('Refresh failed:')]
                    value['warnings'].append('Refresh failed: returning explicitly stale previously retrieved public observations.')
                else:
                    value = self.envelope(kind, LOCATIONS[reference] if kind != 'market' else None)
                value['attempted_at'] = iso(now)
                value['error'] = dict(code=failure.code, message=failure.message)
                ttl = 60  # Provider errors cannot be hammered by manual refresh.
            expires = self.now() + timedelta(seconds=ttl)
            value['cache'] = dict(hit=False, ttl_seconds=ttl, expires_at=iso(expires))
            self.cache[key] = dict(period=signature, expires_at=expires, value=copy.deepcopy(value))
            return localize_display(kind, copy.deepcopy(value), lang)


LocationId = Literal['nashik', 'pune', 'satara']
CropId = Literal['tomato', 'green_chilli']
LangId = Literal['en', 'ta', 'hi', 'ml', 'zh', 'ms']


def create_app(*, transport=None, clock=None, request_timeout_seconds=15, max_response_bytes=600000):
    if not .001 <= request_timeout_seconds <= 30 or not 1024 <= max_response_bytes <= 2000000:
        raise ValueError('Gateway request timeout/body bounds are invalid.')
    client = httpx.AsyncClient(transport=transport, follow_redirects=False,
        timeout=httpx.Timeout(request_timeout_seconds, connect=min(5, request_timeout_seconds)),
        limits=httpx.Limits(max_connections=4, max_keepalive_connections=4),
        headers={'User-Agent': 'Meraki-public-reference-development/1.0', 'Accept': 'application/json,text/html'})
    gateway = PublicDataGateway(client, clock or (lambda: datetime.now(timezone.utc)), request_timeout_seconds, max_response_bytes)

    @asynccontextmanager
    async def lifespan(_):
        yield
        await client.aclose()

    app = FastAPI(title='Meraki public reference data gateway', version='1.0.0', lifespan=lifespan)
    app.state.gateway = gateway
    allowed_queries = {'health': set(), 'locations': {'lang'}, 'forecast': {'location', 'lang'}, 'history': {'location', 'lang'},
                       'market': {'crop', 'lang'}, 'snapshot': {'location', 'crop', 'lang'}}

    @app.middleware('http')
    async def reject_arbitrary_parameters(request: Request, call_next):
        endpoint = request.url.path.removeprefix('/api/live-data/')
        if endpoint in allowed_queries and (set(request.query_params) - allowed_queries[endpoint] or
                any(len(request.query_params.getlist(key)) != 1 for key in request.query_params)):
            return JSONResponse(status_code=422, content={'detail': 'Only documented, single-valued allowlisted query parameters are accepted.'})
        return await call_next(request)

    @app.get('/api/live-data/health')
    async def health():
        return dict(status='ok', mode='public_reference_development', synthetic=False,
                    server_time=iso(gateway.now()), upstream_health='not_probed', private_farm_data=False)

    @app.get('/api/live-data/locations')
    async def locations(lang: LangId = 'en'):
        l = localize_lang(lang)
        return dict(locations=[{**v, 'name': DISPLAY[l]['loc'].get(k, v['name'])} for k, v in LOCATIONS.items()],
                    crops=[dict(id=k, name=DISPLAY[l]['crop'].get(k, v['name'])) for k, v in CROPS.items()])

    @app.get('/api/live-data/forecast')
    async def forecast(location: LocationId = 'nashik', lang: LangId = 'en'):
        return await gateway.get('forecast', location, lang)

    @app.get('/api/live-data/history')
    async def history(location: LocationId = 'nashik', lang: LangId = 'en'):
        return await gateway.get('history', location, lang)

    @app.get('/api/live-data/market')
    async def market(crop: CropId = 'tomato', lang: LangId = 'en'):
        return await gateway.get('market', crop, lang)

    @app.get('/api/live-data/snapshot')
    async def snapshot(location: LocationId = 'nashik', crop: CropId = 'tomato', lang: LangId = 'en'):
        forecast_value, history_value, market_value = await asyncio.gather(
            gateway.get('forecast', location, lang), gateway.get('history', location, lang), gateway.get('market', crop, lang))
        return dict(server_time=iso(gateway.now()), forecast=forecast_value, history=history_value, market=market_value)

    return app


app = create_app()
