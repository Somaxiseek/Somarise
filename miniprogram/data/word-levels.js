'use strict';
// 新词难度分级（用户 10-30：学英语一开始接触到的应该是比较简单的单词，
// 「我看到 monounsaturated fat 头都大」）。
//
// 三档：
//   1 入门 —— 高频日常词，见面就该认识（squat / headache / apartment / understand）
//   2 进阶 —— 主题里的常用词，学到哪儿用到哪儿（deadlift / migraine / hypothesis）
//   3 高阶 —— 术语、拉丁名、生化词，一天最多出现一个（iliopsoas / leucine / PDCAAS）
//
// 判断主要看「常见度」而不是词长（用户 10-30 点名）：apartment 九个字母但人人认识，
// leucine 七个字母但没碰过生化的人照样头大。所以：
//   · 长而常见的词进 L1_EXTRA / L2_FORCE（往下压）
//   · 短而生僻的词进 L3_FORCE（往上提）
//   · 剩下的按「分类先验 + 词长」兜底：daily/mind 天然偏易，
//     anatomy/foot 全是拉丁语天然偏难，nutrition/training/health 居中。
// 清单用逗号分隔——词库里多词短语很多（bench press），不能用空格切。

function setOf(src) {
  return new Set(src.toLowerCase().split(/\s*,\s*/).filter(Boolean));
}

// 长而常见的词 → 入门。大头是 daily 里的生活词和基本动词/形容词。
const L1_EXTRA = setOf(('apartment, balcony, ceiling, hallway, kitchen, laundry, basement, garage, garden, curtain, blanket, pillow, mattress, elevator, chimney, mailbox, doorbell, furniture, wardrobe, mirror, household, fireplace, radiator, fridge, freezer, microwave, toaster, dishwasher, vacuum, heater, charger, battery, adapter, headphones, earphones, keyboard, printer, flashlight, umbrella, backpack, handbag, wallet, keychain, sunglasses, toothbrush, toothpaste, shampoo, scissors, sandwich, sausage, seafood, strawberry, watermelon, pineapple, pumpkin, celery, lettuce, coffee, cocktail, lemonade, breakfast, dinner, buffet, picnic, flavour, receipt, discount, cashier, weekday, weekend, midnight, sunrise, sunset, calendar, timetable, deadline, anniversary, birthday, festival, holiday, vacation, afternoon, evening, weather, temperature, thunderstorm, sunshine, rainbow, waterfall, forest, island, lightning, thunder, drought, heatwave, puddle, climate, subway, highway, traffic, raincoat, terminal, luggage, passport, parking, junction, scooter, bicycle, motorcycle, helmet, carriage, conductor, downtown, museum, library, stadium, supermarket, restaurant, factory, office, village, meeting, agenda, overtime, promotion, interview, salary, budget, project, notebook, textbook, scholarship, assignment, homework, lecture, seminar, degree, certificate, career, contract, feedback, document, conference, workshop, teamwork, retirement, course, lesson, classroom, professor, research, workplace, movie, series, episode, playlist, concert, ticket, novel, magazine, painting, photography, camping, lyrics, soundtrack, subtitle, channel, exhibition, cinema, theatre, album, podcast, documentary, souvenir, reservation, hostel, landmark, hotel, resort, cruise, destination, journey, suitcase, elephant, monkey, squirrel, pigeon, dolphin, penguin, mosquito, mountain, shoulder, finger, forehead, eyebrow, eyelid, stranger, teenager, understand, beautiful, different, difficult, important,' +
  'achieve, admit, advise, announce, apologise, appreciate, arrange, attend, avoid, bother, cancel, celebrate, challenge, choose, complain, concentrate, confirm, consider, convince, create, criticise, decide, declare, defend, deliver, deny, describe, design, destroy, develop, discover, discuss, disturb, divide, earn, edit, educate, embarrass, escape, exist, expand, expect, explain, explore, express, fetch, forgive, gather, greet, guarantee, guess, handle, hesitate, identify, ignore, imagine, impress, insist, introduce, invent, invite, involve, lend, limit, manage, marry, matter, mention, notice, offer, operate, organise, pause, perform, persuade, practise, praise, prefer, prepare, pretend, prevent, produce, promise, protect, prove, provide, publish, punish, raise, reach, realise, receive, recognise, recommend, record, reduce, refuse, regret, reject, remain, remind, remove, repair, repeat, replace, reply, report, request, require, rescue, return, reveal, rush, scream, search, select, separate, settle, shake, shine, solve, speak, spend, spread, struggle, succeed, suffer, suggest, supply, suppose, surprise, survive, switch, threaten, throw, touch, transfer, translate, travel, treat, twist, unlock, update, squeeze, vanish, visit, vote, warn, waste, weigh, whisper, wish, wonder, write,' +
  'amazed, ancient, angry, ashamed, average, awful, basic, boring, brave, bright, brilliant, broken, careful, casual, certain, cheerful, clever, comfortable, confident, confused, convenient, crazy, cruel, curious, dangerous, delicious, disappointed, eager, embarrassed, empty, enjoyable, entire, exact, excellent, excited, expensive, familiar, famous, favourite, fresh, friendly, frightened, gentle, grateful, guilty, harsh, healthy, helpful, honest, hungry, impossible, independent, interested, jealous, lively, lonely, lovely, lucky, married, mature, mental, modest, narrow, natural, noisy, normal, obvious, official, opposite, ordinary, original, outgoing, patient, perfect, personal, physical, polite, popular, positive, possible, powerful, precious, proud, quiet, reasonable, recent, regular, relaxed, reliable, rude, satisfied, scary, sensible, sensitive, serious, severe, sharp, shy, silent, sincere, slight, slim, smart, smooth, strange, strict, stubborn, sudden, sufficient, suitable, surprised, tender, terrible, thankful, tight, tough, typical, unable, unfair, unhappy, unique, upset, urgent, useless, valuable, weird, willing, worried,' +
  'actually, almost, already, although, anyway, certainly, definitely, directly, especially, eventually, exactly, extremely, fairly, finally, fortunately, gradually, hardly, immediately, indeed, instead, lately, meanwhile, mostly, nearly, obviously, occasionally, otherwise, partly, perhaps, probably, quickly, rarely, really, recently, regularly, relatively, repeatedly, seriously, shortly, simply, slightly, slowly, smoothly, somehow, somewhat, soon, specifically, still, suddenly, sufficiently, surely, therefore, though, thus, totally, truly, typically, ultimately, unfortunately, usually, utterly, virtually, twice, widely, willingly,' +
  'warm-up, pull-up, push-up, chin-up, sit-up, headache, protein'));

// 规则会判成高阶、其实很常见的词 → 进阶。
const L2_FORCE = setOf(('kettlebell, hypertrophy, flexibility, progressive overload, intensity, endurance, isometric, eccentric, concentric, plyometric, metcon, tabata, EMOM, AMRAP, WOD, VO2 max, DOMS, PNF, RPE, deadlift,' +
  'unsaturated fat, carbohydrate, cholesterol, metabolism, creatine, whey, casein, stevia, quinoa, kefir, amino acid, glycemic index,' +
  'quadriceps, scapula, clavicle, cartilage, vertebra, ligament, trapezius, diaphragm, pelvis, rotator cuff, tennis elbow, hip abductor,' +
  'hypothesis, correlation, meta-analysis, systematic review, double-blind, evidence-based, confirmation bias, placebo effect,' +
  'nausea, palpitations, plantar fascia, plantar fasciitis, pronation, supination, heel strike, ankle sprain, shin splint, arch support, orthotic'));

// 短而生僻、或长在分类先验里但规则兜不住的词 → 高阶。
const L3_FORCE = setOf(('leucine, isoleucine, valine, lysine, methionine, threonine, tryptophan, phenylalanine, histidine, PDCAAS, maltodextrin, dextrose, erythritol, gluconeogenesis, hydrogenation, tempeh, seitan, courgette, tenant,' +
  'calcaneus, talus, navicular, cuneiform, phalanges, sesamoid, syndesmosis, talocrural joint, Chopart joint, Lisfranc joint, hallux, abductor hallucis, flexor hallucis longus, flexor digitorum brevis, peroneus longus, peroneus brevis, tibialis posterior, tibialis anterior,' +
  'gluteus maximus, gluteus medius, gluteus minimus, biceps brachii, triceps brachii, pectoralis major, pectoralis minor, biceps femoris, rectus femoris, vastus lateralis, vastus medialis, vastus intermedius, semimembranosus, semitendinosus, tensor fasciae latae, psoas major, iliacus, sartorius, gracilis, pectineus, popliteus, brachialis, brachioradialis, coracobrachialis, pronator teres, supinator, extensor carpi radialis, flexor carpi ulnaris, erector spinae, serratus anterior, supraspinatus, infraspinatus, subscapularis, multifidus, transverse abdominis, rectus abdominis, iliopsoas, piriformis, quadratus femoris, quadratus lumborum, triceps surae, adductor magnus, adductor longus, adductor brevis, levator scapulae, teres minor, teres major, iliotibial band, acetabulum, greater trochanter, acromion, glenoid, labrum,' +
  'cossack squat, pallof press, jefferson curl, spoto press, pendlay row, nordic hamstring curl, valsalva maneuver, myo-reps, arthrokinematics, nocebo, malaise, neuralgia, myalgia, bursitis, Occam\'s razor, falsifiability, epidemiology, confounding variable, reproducibility, statistical significance, observational study'));

// 最长的那段词（多词短语看单词，不看整体）：apartment→9，amino acid→5
function longestToken(s) {
  return s.split(/[\s-]+/).reduce((m, t) => Math.max(m, t.length), 0);
}

// 兜底规则：分类先验 × 词长。
function baseLevel(word) {
  const cat = word.cat;
  const n = longestToken(word.w);
  if (cat === 'daily' || cat === 'mind') return n <= 7 ? 1 : 2;          // 生活词/心理词都常见
  if (cat === 'training') return n <= 5 ? 1 : (n <= 9 ? 2 : 3);
  if (cat === 'nutrition') return n <= 6 ? 1 : (n <= 9 ? 2 : 3);
  if (cat === 'health') return n <= 5 ? 1 : (n <= 9 ? 2 : 3);
  // 解剖/足部/科学/哲学：拉丁与术语的大本营，长词基本都难
  return n <= 9 ? 2 : 3;
}

// 词 → 难度档（1/2/3）。清单优先，规则兜底。
function level(word) {
  const s = String(word.w || '').toLowerCase();
  if (L3_FORCE.has(s)) return 3;
  if (L1_EXTRA.has(s)) return 1;
  if (L2_FORCE.has(s)) return 2;
  return baseLevel(word);
}

module.exports = { level, L1_EXTRA, L2_FORCE, L3_FORCE };
