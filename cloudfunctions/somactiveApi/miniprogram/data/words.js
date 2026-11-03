'use strict';
// 健身 + 营养词库：100 条，分三类
//   training  训练动作与术语
//   anatomy   身体结构
//   nutrition 营养
// id 由英文小写转连字符生成，复习进度按 id 存在后端 —— 改了词条文字就等于换了一个新词。
//
// 两个例句：
//   say / sayZh  在馆里跟外国会员、教练真能开口说的话（口语，能直接照着讲）
//   ex  / exZh   动作用意的说明句（写在下面的注解）
const CORE=[
  // ---- training 训练动作与术语（40）----
  {w:'squat',ipa:'/skwɒt/',pos:'n./v.',zh:'深蹲；蹲',say:"Let's start with the squat — feet about shoulder width.",sayZh:'我们先从深蹲开始，脚大概与肩同宽。',ex:'Keep your chest up in the squat.',exZh:'深蹲时保持胸口挺起。',cat:'training'},
  {w:'hinge',ipa:'/hɪndʒ/',pos:'n./v.',zh:'髋铰链；以髋为轴折叠',say:'Think hinge at the hips, not a bend at the waist.',sayZh:'想的是髋往后折，不是腰往下弯。',ex:'A deadlift is a hip hinge, not a squat.',exZh:'硬拉是髋主导的折叠，不是深蹲。',cat:'training'},
  {w:'lunge',ipa:'/lʌndʒ/',pos:'n.',zh:'弓步',say:'Take a long step forward — that is a lunge.',sayZh:'往前迈一大步，这就是弓步。',ex:'Step forward into a lunge.',exZh:'向前迈步成弓步。',cat:'training'},
  {w:'deadlift',ipa:'/ˈdedlɪft/',pos:'n.',zh:'硬拉',say:'Set up for the deadlift — bar over mid-foot.',sayZh:'准备硬拉，杠铃对准脚掌中部。',ex:'Set your back before the deadlift.',exZh:'硬拉前先收紧背部。',cat:'training'},
  {w:'bench press',ipa:'/bentʃ pres/',pos:'n.',zh:'卧推',say:'The bench press is free — do you want a spot?',sayZh:'卧推架空了，需要人保护吗？',ex:'Two sets of bench press left.',exZh:'还剩两组卧推。',cat:'training'},
  {w:'overhead press',ipa:'/ˌəʊvəˈhed pres/',pos:'n.',zh:'站姿推举',say:'Keep the bar over your ears on the overhead press.',sayZh:'推举的时候杠铃保持在耳朵上方。',ex:'The overhead press trains your shoulders.',exZh:'站姿推举练的是肩膀。',cat:'training'},
  {w:'pull-up',ipa:'/ˈpʊl ʌp/',pos:'n.',zh:'引体向上',say:'Can you do a pull-up without the band?',sayZh:'不用弹力带，你能做一个引体吗？',ex:'I can do three pull-ups now.',exZh:'我现在能做三个引体向上。',cat:'training'},
  {w:'chin-up',ipa:'/ˈtʃɪn ʌp/',pos:'n.',zh:'反手引体向上',say:'Try a chin-up — palms facing you.',sayZh:'试试反手引体，手心朝自己。',ex:'A chin-up uses your biceps more.',exZh:'反手引体更用肱二头肌。',cat:'training'},
  {w:'row',ipa:'/rəʊ/',pos:'n./v.',zh:'划船（拉类动作）',say:'Row it to your belly button, not your chest.',sayZh:'拉到肚脐的位置，不是拉到胸口。',ex:'Row the weight to your ribs.',exZh:'把重量拉到肋骨位置。',cat:'training'},
  {w:'dip',ipa:'/dɪp/',pos:'n.',zh:'双杠臂屈伸',say:'The dip bars are on the other side.',sayZh:'双杠在另一边。',ex:'Keep your shoulders down in the dip.',exZh:'做臂屈伸时肩膀别耸起来。',cat:'training'},
  {w:'plank',ipa:'/plæŋk/',pos:'n.',zh:'平板支撑',say:'Hold the plank for thirty seconds — keep breathing.',sayZh:'平板支撑保持三十秒，别憋气。',ex:'Hold the plank for forty seconds.',exZh:'平板支撑保持四十秒。',cat:'training'},
  {w:'push-up',ipa:'/ˈpʊʃ ʌp/',pos:'n.',zh:'俯卧撑',say:'Push-ups on your knees still count.',sayZh:'跪姿俯卧撑一样算数。',ex:'Ten push-ups is a good start.',exZh:'十个俯卧撑是不错的开始。',cat:'training'},
  {w:'kettlebell',ipa:'/ˈketlbəl/',pos:'n.',zh:'壶铃',say:'Grab a kettlebell — the light one.',sayZh:'拿个壶铃，轻的那个。',ex:'Swing the kettlebell with your hips.',exZh:'用髋部甩壶铃。',cat:'training'},
  {w:'dumbbell',ipa:'/ˈdʌmbel/',pos:'n.',zh:'哑铃',say:'One dumbbell or two?',sayZh:'一个哑铃还是两个？',ex:'Grab a light dumbbell.',exZh:'拿一只轻哑铃。',cat:'training'},
  {w:'barbell',ipa:'/ˈbɑːbel/',pos:'n.',zh:'杠铃',say:'Is the barbell loaded for you?',sayZh:'杠铃给你上好片了吗？',ex:'Load the barbell evenly.',exZh:'杠铃两边重量要一样。',cat:'training'},
  {w:'rep',ipa:'/rep/',pos:'n.',zh:'一次（重复动作）',say:"Two more reps — you've got this.",sayZh:'再做两个，你可以的。',ex:'Aim for eight reps.',exZh:'目标做八次。',cat:'training'},
  {w:'set',ipa:'/set/',pos:'n.',zh:'一组',say:'How many sets do you have left?',sayZh:'你还剩几组？',ex:'Rest a minute between sets.',exZh:'组间歇一分钟。',cat:'training'},
  {w:'tempo',ipa:'/ˈtempəʊ/',pos:'n.',zh:'动作节奏',say:'Slow the tempo down — three seconds on the way down.',sayZh:'放慢节奏，下放数三秒。',ex:'Slow the tempo on the way down.',exZh:'下放时放慢节奏。',cat:'training'},
  {w:'range of motion',ipa:'/reɪndʒ əv ˈməʊʃn/',pos:'n.',zh:'活动幅度',say:'Give me your full range of motion on this one.',sayZh:'这个动作用完整的幅度做。',ex:'Use your full range of motion.',exZh:'用完整的活动幅度。',cat:'training'},
  {w:'form',ipa:'/fɔːm/',pos:'n.',zh:'动作姿势',say:'Your form looks good — we can add a little weight.',sayZh:'动作很标准，可以加点重量了。',ex:'Good form beats heavy weight.',exZh:'动作标准比重量大更重要。',cat:'training'},
  {w:'warm-up',ipa:'/ˈwɔːm ʌp/',pos:'n.',zh:'热身',say:'Warm-up first — five minutes on the bike.',sayZh:'先热身，骑车五分钟。',ex:'Five minutes of warm-up first.',exZh:'先热身五分钟。',cat:'training'},
  {w:'cool-down',ipa:'/ˌkuːl ˈdaʊn/',pos:'n.',zh:'放松整理',say:"Let's finish with a short cool-down.",sayZh:'最后做一组简短的放松。',ex:'End with a short cool-down.',exZh:'最后做一组简短的放松。',cat:'training'},
  {w:'mobility',ipa:'/məʊˈbɪləti/',pos:'n.',zh:'关节活动度',say:'Your ankle mobility is limiting your depth.',sayZh:'你的踝关节活动度限制了深蹲深度。',ex:'Ankle mobility limits your squat.',exZh:'踝关节活动度限制你的深蹲。',cat:'training'},
  {w:'flexibility',ipa:'/ˌfleksəˈbɪləti/',pos:'n.',zh:'柔韧性',say:'Flexibility work twice a week is plenty.',sayZh:'柔韧训练一周两次就够了。',ex:'Stretching improves flexibility.',exZh:'拉伸能改善柔韧性。',cat:'training'},
  {w:'stability',ipa:'/stəˈbɪləti/',pos:'n.',zh:'稳定性',say:'Slow it down — we are working on stability.',sayZh:'慢一点做，这组练的是稳定。',ex:'Single-leg work builds stability.',exZh:'单腿训练能建立稳定性。',cat:'training'},
  {w:'eccentric',ipa:'/ˌeksenˈtrɪk/',pos:'adj.',zh:'离心的（肌肉拉长）',say:"Control the eccentric — don't let it drop.",sayZh:'控制离心那一段，别让它掉下去。',ex:'The eccentric phase builds strength.',exZh:'离心阶段能长力量。',cat:'training'},
  {w:'concentric',ipa:'/kənˈsentrɪk/',pos:'adj.',zh:'向心的（肌肉缩短）',say:'Push up fast on the concentric part.',sayZh:'向心那一段快速推起来。',ex:'Push up fast in the concentric phase.',exZh:'向心阶段快速推起。',cat:'training'},
  {w:'isometric',ipa:'/ˌaɪsəʊˈmetrɪk/',pos:'adj.',zh:'等长的（长度不变）',say:'Hold it right there — isometric, ten seconds.',sayZh:'就停在那个位置，等长十秒。',ex:'A wall sit is isometric.',exZh:'靠墙静蹲是等长训练。',cat:'training'},
  {w:'hypertrophy',ipa:'/haɪˈpɜːtrəfi/',pos:'n.',zh:'肌肥大',say:'If hypertrophy is the goal, you have to eat enough.',sayZh:'目标是想长肌肉的话，就得吃够。',ex:'Volume drives hypertrophy.',exZh:'训练量推动肌肉生长。',cat:'training'},
  {w:'endurance',ipa:'/ɪnˈdjʊərəns/',pos:'n.',zh:'耐力',say:'For endurance, go lighter and longer.',sayZh:'练耐力就轻一点、久一点。',ex:'Long runs build endurance.',exZh:'长距离跑建立耐力。',cat:'training'},
  {w:'progressive overload',ipa:'/prəˈgresɪv ˈəʊvələʊd/',pos:'n.',zh:'渐进超负荷',say:'Add five kilos next week — that is progressive overload.',sayZh:'下周加五公斤，这就是渐进超负荷。',ex:'Add a little weight for progressive overload.',exZh:'一点点加重量实现渐进超负荷。',cat:'training'},
  {w:'volume',ipa:'/ˈvɒljuːm/',pos:'n.',zh:'训练量',say:'Your weekly volume is a bit low for that goal.',sayZh:'按这个目标，你每周训练量有点低。',ex:'Weekly volume matters more than one session.',exZh:'每周训练量比单次训练更重要。',cat:'training'},
  {w:'intensity',ipa:'/ɪnˈtensəti/',pos:'n.',zh:'强度',say:'Keep the intensity, drop one set.',sayZh:'强度保持住，少做一组。',ex:'Lower the volume, raise the intensity.',exZh:'训练量减少，强度提高。',cat:'training'},
  {w:'recovery',ipa:'/rɪˈkʌvəri/',pos:'n.',zh:'恢复',say:'Recovery matters as much as the training.',sayZh:'恢复和训练一样重要。',ex:'Sleep is part of recovery.',exZh:'睡眠也是恢复的一部分。',cat:'training'},
  {w:'deload',ipa:'/ˈdiːləʊd/',pos:'n.',zh:'减量周',say:'Take a deload week — same movements, lighter.',sayZh:'安排个减量周，动作不变，重量轻一点。',ex:'Take a deload every six weeks.',exZh:'每六周安排一个减量周。',cat:'training'},
  {w:'failure',ipa:'/ˈfeɪljə/',pos:'n.',zh:'力竭',say:'Stop one rep before failure.',sayZh:'留一个不做，别做到力竭。',ex:'Stop one rep short of failure.',exZh:'留一次余量，不要做到力竭。',cat:'training'},
  {w:'spotter',ipa:'/ˈspɒtə/',pos:'n.',zh:'保护者',say:"I'll be your spotter.",sayZh:'我给你做保护。',ex:'Ask for a spotter on bench day.',exZh:'练卧推那天找个保护的人。',cat:'training'},
  {w:'cue',ipa:'/kjuː/',pos:'n.',zh:'动作提示',say:'One cue only: chest up.',sayZh:'只记一个提示：胸口挺起。',ex:'One cue at a time is enough.',exZh:'一次给一个提示就够了。',cat:'training'},
  {w:'superset',ipa:'/ˈsuːpəset/',pos:'n.',zh:'超级组',say:"Let's superset these two so you save time.",sayZh:'把这两个做成超级组，省时间。',ex:'Superset rows with push-ups.',exZh:'把划船和俯卧撑做成超级组。',cat:'training'},
  {w:'circuit',ipa:'/ˈsɜːkɪt/',pos:'n.',zh:'循环训练',say:'Three rounds of this circuit, then we are done.',sayZh:'这套循环做三轮就结束了。',ex:'Three rounds of this circuit.',exZh:'这套循环做三轮。',cat:'training'},

  // ---- anatomy 身体结构（25）----
  {w:'scapula',ipa:'/ˈskæpjələ/',pos:'n.',zh:'肩胛骨',say:'Keep your scapula down — try not to shrug.',sayZh:'肩胛骨压下去，别耸肩。',ex:'Pull your scapula back and down.',exZh:'肩胛骨向后向下收。',cat:'anatomy'},
  {w:'clavicle',ipa:'/ˈklævɪkl/',pos:'n.',zh:'锁骨',say:'He broke his clavicle last year, so he is careful now.',sayZh:'他去年锁骨骨折过，所以现在很小心。',ex:'The clavicle meets the sternum.',exZh:'锁骨与胸骨相连。',cat:'anatomy'},
  {w:'humerus',ipa:'/ˈhjuːmərəs/',pos:'n.',zh:'肱骨',say:'Keep the humerus sitting in the socket.',sayZh:'让肱骨老老实实待在关节窝里。',ex:'The humerus sits in the shoulder socket.',exZh:'肱骨嵌在肩关节窝里。',cat:'anatomy'},
  {w:'femur',ipa:'/ˈfiːmə/',pos:'n.',zh:'股骨',say:'Push the ground away with your femur.',sayZh:'用股骨把地面推开。',ex:'The femur is the longest bone.',exZh:'股骨是最长的骨头。',cat:'anatomy'},
  {w:'pelvis',ipa:'/ˈpelvɪs/',pos:'n.',zh:'骨盆',say:'Tuck your pelvis slightly and brace.',sayZh:'骨盆稍微收一点，收紧核心。',ex:'Keep the pelvis level.',exZh:'保持骨盆水平。',cat:'anatomy'},
  {w:'spine',ipa:'/spaɪn/',pos:'n.',zh:'脊柱',say:'Long spine, eyes forward.',sayZh:'脊柱拉长，眼睛看前面。',ex:'A neutral spine protects your back.',exZh:'脊柱中立能保护腰背。',cat:'anatomy'},
  {w:'lumbar',ipa:'/ˈlʌmbə/',pos:'adj.',zh:'腰椎的',say:'How is your lumbar feeling today?',sayZh:'今天腰感觉怎么样？',ex:'Lumbar flexion is fine for most people.',exZh:'对多数人来说腰椎屈曲没问题。',cat:'anatomy'},
  {w:'thoracic',ipa:'/θəˈræsɪk/',pos:'adj.',zh:'胸椎的',say:'Open up the thoracic spine a little.',sayZh:'把胸椎打开一点。',ex:'Thoracic rotation helps your press.',exZh:'胸椎旋转对推举有帮助。',cat:'anatomy'},
  {w:'rotator cuff',ipa:'/rəʊˈteɪtə kʌf/',pos:'n.',zh:'肩袖',say:'This one is easy on the rotator cuff.',sayZh:'这个对肩袖比较友好。',ex:'The rotator cuff stabilises the shoulder.',exZh:'肩袖让肩关节稳定。',cat:'anatomy'},
  {w:'deltoid',ipa:'/ˈdeltɔɪd/',pos:'n.',zh:'三角肌',say:"You'll feel it in your deltoid tomorrow.",sayZh:'明天你会觉得三角肌酸。',ex:'Raises work all three deltoid heads.',exZh:'侧平举能练到三角肌三束。',cat:'anatomy'},
  {w:'pectoral',ipa:'/ˈpektərəl/',pos:'n.',zh:'胸肌',say:'Stretch your pectoral after all that pressing.',sayZh:'推完这么多，拉伸一下胸肌。',ex:'The pectoral pulls the arm across the body.',exZh:'胸肌把手臂拉向身体中线。',cat:'anatomy'},
  {w:'latissimus',ipa:'/ˌlætɪˈsɪməs/',pos:'n.',zh:'背阔肌',say:'Try to feel your latissimus doing the work.',sayZh:'试着感受背阔肌在发力。',ex:'The latissimus is the widest back muscle.',exZh:'背阔肌是背部最宽的肌肉。',cat:'anatomy'},
  {w:'trapezius',ipa:'/trəˈpiːziəs/',pos:'n.',zh:'斜方肌',say:"Don't let your trapezius take over.",sayZh:'别让斜方肌代偿。',ex:'The trapezius shrugs the shoulders.',exZh:'斜方肌负责耸肩。',cat:'anatomy'},
  {w:'rhomboid',ipa:'/ˈrɒmbɔɪd/',pos:'n.',zh:'菱形肌',say:'Squeeze your rhomboid at the back of the rep.',sayZh:'动作后半段夹紧菱形肌。',ex:'Rows strengthen the rhomboid.',exZh:'划船能强化菱形肌。',cat:'anatomy'},
  {w:'erector spinae',ipa:'/ɪˈrektə ˈspaɪniː/',pos:'n.',zh:'竖脊肌',say:'Keep your erector spinae switched on the whole time.',sayZh:'全程让竖脊肌保持收紧。',ex:'The erector spinae keeps you upright.',exZh:'竖脊肌让你保持直立。',cat:'anatomy'},
  {w:'gluteus',ipa:'/ˈgluːtiəs/',pos:'n.',zh:'臀肌',say:'Squeeze your gluteus at the top of the rep.',sayZh:'顶端收紧臀部。',ex:'Squeeze the gluteus at the top.',exZh:'顶端收紧臀部。',cat:'anatomy'},
  {w:'quadriceps',ipa:'/ˈkwɒdrɪseps/',pos:'n.',zh:'股四头肌',say:"You'll feel this one in your quadriceps.",sayZh:'这个你会感觉在股四头。',ex:'The quadriceps straightens the knee.',exZh:'股四头肌负责伸膝。',cat:'anatomy'},
  {w:'hamstring',ipa:'/ˈhæmstrɪŋ/',pos:'n.',zh:'腘绳肌',say:'How are your hamstrings after yesterday?',sayZh:'昨天练完，今天腘绳肌怎么样？',ex:'The hamstring bends the knee.',exZh:'腘绳肌负责屈膝。',cat:'anatomy'},
  {w:'adductor',ipa:'/əˈdʌktə/',pos:'n.',zh:'内收肌',say:'This one hits the adductor more than you think.',sayZh:'这个比你想象的更练内收肌。',ex:'The adductor pulls the leg inward.',exZh:'内收肌把腿向内收。',cat:'anatomy'},
  {w:'calf',ipa:'/kɑːf/',pos:'n.',zh:'小腿肚；腓肠肌',say:"Your calf looks tight — let's stretch it out.",sayZh:'你小腿看着挺紧，我们拉伸一下。',ex:'My calf is sore today.',exZh:'我今天小腿酸痛。',cat:'anatomy'},
  {w:'Achilles tendon',ipa:'/əˈkɪliːz ˈtendən/',pos:'n.',zh:'跟腱',say:'Does your Achilles tendon hurt in the morning?',sayZh:'早上跟腱会疼吗？',ex:'A tight calf loads the Achilles tendon.',exZh:'小腿太紧会让跟腱负担变重。',cat:'anatomy'},
  {w:'patella',ipa:'/pəˈtelə/',pos:'n.',zh:'髌骨',say:'Keep the patella tracking over your toes.',sayZh:'让髌骨的方向对着脚尖。',ex:'The patella glides over the knee.',exZh:'髌骨在膝关节上滑动。',cat:'anatomy'},
  {w:'meniscus',ipa:'/məˈnɪskəs/',pos:'n.',zh:'半月板',say:'Twisting under load is hard on the meniscus.',sayZh:'负重扭转对半月板不友好。',ex:'Deep knee bends can stress the meniscus.',exZh:'过深的屈膝会给半月板压力。',cat:'anatomy'},
  {w:'ligament',ipa:'/ˈlɪɡəmənt/',pos:'n.',zh:'韧带',say:'Ligaments need time — give it a few weeks.',sayZh:'韧带恢复需要时间，给它几周。',ex:'A ligament connects bone to bone.',exZh:'韧带连接骨头与骨头。',cat:'anatomy'},
  {w:'tendon',ipa:'/ˈtendən/',pos:'n.',zh:'肌腱',say:'Tendons adapt slower than muscles.',sayZh:'肌腱比肌肉适应得慢。',ex:'A tendon connects muscle to bone.',exZh:'肌腱连接肌肉与骨头。',cat:'anatomy'},

  // ---- nutrition 营养（35）----
  {w:'protein',ipa:'/ˈprəʊtiːn/',pos:'n.',zh:'蛋白质',say:'How much protein do you eat in a day?',sayZh:'你一天吃多少蛋白质？',ex:'Add protein to every meal.',exZh:'每餐都加点蛋白质。',cat:'nutrition'},
  {w:'carb',ipa:'/kɑːb/',pos:'n.',zh:'碳水化合物',say:'Save your carbs for around training.',sayZh:'碳水尽量放在训练前后吃。',ex:'Carbs fuel hard training.',exZh:'碳水给高强度训练供能。',cat:'nutrition'},
  {w:'fat',ipa:'/fæt/',pos:'n.',zh:'脂肪',say:'Keep some fat in your diet — it is not the enemy.',sayZh:'饮食里留点脂肪，它不是敌人。',ex:'Fat helps you absorb vitamins.',exZh:'脂肪帮助吸收维生素。',cat:'nutrition'},
  {w:'calorie',ipa:'/ˈkæləri/',pos:'n.',zh:'卡路里；热量',say:'How many calories are you aiming for?',sayZh:'你的热量目标是多少？',ex:'A banana has about 100 calories.',exZh:'一根香蕉大约 100 卡。',cat:'nutrition'},
  {w:'macronutrient',ipa:'/ˌmækrəʊˈnjuːtriənt/',pos:'n.',zh:'宏量营养素',say:"Let's look at your macronutrients before anything else.",sayZh:'我们先看宏量营养素，其他往后放。',ex:'Protein is the macro I track first.',exZh:'蛋白质是我最先盯的宏量营养素。',cat:'nutrition'},
  {w:'micronutrient',ipa:'/ˌmaɪkrəʊˈnjuːtriənt/',pos:'n.',zh:'微量营养素',say:'Vegetables and fruit cover most micronutrients.',sayZh:'蔬菜和水果能覆盖大部分微量营养素。',ex:'Vegetables bring micronutrients.',exZh:'蔬菜提供微量营养素。',cat:'nutrition'},
  {w:'fiber',ipa:'/ˈfaɪbə/',pos:'n.',zh:'膳食纤维',say:'Add some fiber — it keeps you full longer.',sayZh:'加点纤维，扛饿更久。',ex:'Fiber keeps you full longer.',exZh:'膳食纤维让饱腹感更久。',cat:'nutrition'},
  {w:'starch',ipa:'/stɑːtʃ/',pos:'n.',zh:'淀粉',say:'Starch before training works well for you.',sayZh:'训练前吃点淀粉对你挺合适。',ex:'Rice is mostly starch.',exZh:'米饭主要是淀粉。',cat:'nutrition'},
  {w:'sugar',ipa:'/ˈʃʊɡə/',pos:'n.',zh:'糖',say:'How much sugar do you take in your coffee?',sayZh:'你咖啡里放多少糖？',ex:'Cut the sugar in your coffee.',exZh:'把咖啡里的糖减掉。',cat:'nutrition'},
  {w:'glycemic index',ipa:'/ɡlaɪˈsiːmɪk ˈɪndeks/',pos:'n.',zh:'升糖指数',say:'Low glycemic index carbs keep you steadier.',sayZh:'低升糖的碳水让你状态更稳。',ex:'Oats have a low glycemic index.',exZh:'燕麦升糖指数低。',cat:'nutrition'},
  {w:'insulin',ipa:'/ˈɪnsjəlɪn/',pos:'n.',zh:'胰岛素',say:'Insulin going up after a meal is normal.',sayZh:'餐后胰岛素升高是正常的。',ex:'Insulin moves sugar into your cells.',exZh:'胰岛素把糖送进细胞。',cat:'nutrition'},
  {w:'amino acid',ipa:'/əˈmiːnəʊ ˈæsɪd/',pos:'n.',zh:'氨基酸',say:'Any protein gives you amino acids — powder is optional.',sayZh:'任何蛋白质都能给你氨基酸，蛋白粉不是必须的。',ex:'Protein is made of amino acids.',exZh:'蛋白质由氨基酸组成。',cat:'nutrition'},
  {w:'creatine',ipa:'/ˈkriːətiːn/',pos:'n.',zh:'肌酸',say:'Do you take creatine? Five grams a day is standard.',sayZh:'你吃肌酸吗？一天五克是常规量。',ex:'Five grams of creatine a day is standard.',exZh:'每天五克肌酸是常规用量。',cat:'nutrition'},
  {w:'supplement',ipa:'/ˈsʌplɪmənt/',pos:'n.',zh:'补剂',say:'Do you take any supplements at the moment?',sayZh:'你现在吃什么补剂吗？',ex:'A supplement is not a shortcut.',exZh:'补剂不是捷径。',cat:'nutrition'},
  {w:'hydration',ipa:'/haɪˈdreɪʃn/',pos:'n.',zh:'补水',say:'How is your hydration on training days?',sayZh:'训练日你补水怎么样？',ex:'Hydration affects how you feel.',exZh:'补水影响你的状态。',cat:'nutrition'},
  {w:'electrolyte',ipa:'/ɪˈlektrəlaɪt/',pos:'n.',zh:'电解质',say:'If you sweat a lot, add electrolytes.',sayZh:'出汗多的话，加点电解质。',ex:'Long sessions need electrolytes.',exZh:'长时间训练需要电解质。',cat:'nutrition'},
  {w:'sodium',ipa:'/ˈsəʊdiəm/',pos:'n.',zh:'钠',say:'A little sodium after a long session helps.',sayZh:'长时间训练后补一点钠有帮助。',ex:'Sweat carries sodium out.',exZh:'汗水会带走钠。',cat:'nutrition'},
  {w:'potassium',ipa:'/pəˈtæsiəm/',pos:'n.',zh:'钾',say:'Potassium helps with cramps — bananas are easy.',sayZh:'钾对抽筋有帮助，香蕉最方便。',ex:'Bananas are rich in potassium.',exZh:'香蕉富含钾。',cat:'nutrition'},
  {w:'portion',ipa:'/ˈpɔːʃn/',pos:'n.',zh:'份量',say:'That is a good portion for your size.',sayZh:'这个份量对你这个体型挺合适。',ex:'Watch your portion size.',exZh:'留意你的份量。',cat:'nutrition'},
  {w:'serving',ipa:'/ˈsɜːvɪŋ/',pos:'n.',zh:'一份（食物）',say:'One serving is about the size of your palm.',sayZh:'一份大约一个手掌那么大。',ex:'One serving is thirty grams.',exZh:'一份是三十克。',cat:'nutrition'},
  {w:'deficit',ipa:'/ˈdefɪsɪt/',pos:'n.',zh:'热量缺口',say:'A small deficit is easier to keep than a big one.',sayZh:'小缺口比大缺口好坚持。',ex:'A small deficit is easier to hold.',exZh:'小缺口更容易坚持。',cat:'nutrition'},
  {w:'surplus',ipa:'/ˈsɜːpləs/',pos:'n.',zh:'热量盈余',say:'You need a small surplus if you want to grow.',sayZh:'想长肌肉就得有一点盈余。',ex:'Muscle grows in a small surplus.',exZh:'肌肉在小幅盈余下增长。',cat:'nutrition'},
  {w:'maintenance',ipa:'/ˈmeɪntənəns/',pos:'n.',zh:'维持热量',say:'Are you eating at maintenance right now?',sayZh:'你现在吃的是维持热量吗？',ex:'I eat at maintenance on rest days.',exZh:'休息日我吃维持热量。',cat:'nutrition'},
  {w:'metabolism',ipa:'/məˈtæbəlɪzəm/',pos:'n.',zh:'代谢',say:'Your metabolism is not broken — your intake is just high.',sayZh:'你的代谢没问题，只是吃进去的偏多。',ex:'Muscle raises your metabolism slightly.',exZh:'肌肉会略微提高代谢。',cat:'nutrition'},
  {w:'whole food',ipa:'/həʊl fuːd/',pos:'n.',zh:'天然完整食物',say:'Try to build your meals from whole food.',sayZh:'三餐尽量用天然食物来搭。',ex:'Build meals from whole foods.',exZh:'用天然食物搭配三餐。',cat:'nutrition'},
  {w:'processed',ipa:'/ˈprəʊsest/',pos:'adj.',zh:'加工过的',say:'Cut back on processed snacks — they go down too fast.',sayZh:'加工零食少吃点，太容易吃多。',ex:'Processed snacks are easy to overeat.',exZh:'加工零食很容易吃过量。',cat:'nutrition'},
  {w:'saturated fat',ipa:'/ˈsætʃəreɪtɪd fæt/',pos:'n.',zh:'饱和脂肪',say:'Not all saturated fat is bad, but keep it moderate.',sayZh:'饱和脂肪不是全然不好，适量就行。',ex:'Butter is high in saturated fat.',exZh:'黄油饱和脂肪高。',cat:'nutrition'},
  {w:'unsaturated fat',ipa:'/ʌnˈsætʃəreɪtɪd fæt/',pos:'n.',zh:'不饱和脂肪',say:'Olive oil is a good unsaturated fat to cook with.',sayZh:'橄榄油是很好的不饱和脂肪，适合做饭。',ex:'Olive oil is mostly unsaturated fat.',exZh:'橄榄油主要是不饱和脂肪。',cat:'nutrition'},
  {w:'omega-3',ipa:'/əʊˈmeɡə θriː/',pos:'n.',zh:'欧米伽-3 脂肪酸',say:'Do you eat fish? Omega-3 is worth it if you do not.',sayZh:'你吃鱼吗？不吃的话欧米伽-3 值得补。',ex:'Fatty fish is rich in omega-3.',exZh:'深海鱼富含欧米伽-3。',cat:'nutrition'},
  {w:'collagen',ipa:'/ˈkɒlədʒən/',pos:'n.',zh:'胶原蛋白',say:'Collagen is popular, but protein first.',sayZh:'胶原蛋白挺流行，但还是先把蛋白质吃够。',ex:'Collagen is part of your tendons.',exZh:'胶原蛋白是肌腱的组成部分。',cat:'nutrition'},
  {w:'whey',ipa:'/weɪ/',pos:'n.',zh:'乳清',say:'Whey is fine if dairy sits well with you.',sayZh:'肠胃能接受乳制品的话，乳清没问题。',ex:'Whey is a fast protein.',exZh:'乳清是吸收快的蛋白质。',cat:'nutrition'},
  {w:'casein',ipa:'/ˈkeɪsiːn/',pos:'n.',zh:'酪蛋白',say:'Some people take casein before bed.',sayZh:'有些人睡前会喝酪蛋白。',ex:'Casein digests slowly.',exZh:'酪蛋白消化得慢。',cat:'nutrition'},
  {w:'glycogen',ipa:'/ˈɡlaɪkədʒən/',pos:'n.',zh:'糖原',say:'Refill your glycogen after training.',sayZh:'训练后补一下糖原。',ex:'Carbs refill muscle glycogen.',exZh:'碳水补充肌肉糖原。',cat:'nutrition'},
  {w:'caffeine',ipa:'/ˈkæfiːn/',pos:'n.',zh:'咖啡因',say:'How much caffeine do you take before training?',sayZh:'训练前你摄入多少咖啡因？',ex:'Caffeine late in the day hurts sleep.',exZh:'太晚喝咖啡因会影响睡眠。',cat:'nutrition'},
  {w:'lean mass',ipa:'/liːn mæs/',pos:'n.',zh:'瘦体重',say:"Let's keep your lean mass while you lose fat.",sayZh:'减脂的同时把瘦体重保住。',ex:'Protein helps protect lean mass.',exZh:'蛋白质有助于保住瘦体重。',cat:'nutrition'}
];

// 分类名要能一眼看懂：光写「训练」会被当成打卡的训练，写成「训练动作」才是词库分类
const CATS=require('./cats').CATS;

// 后面扩的词按主题分文件放，这里汇总：新增一批就加一个文件，不用动这个文件里的旧词
const EXTRA=[].concat(
  require('./words/anatomy'),
  require('./words/foot'),
  require('./words/joint'),
  require('./words/training'),
  require('./words/gym'),
  require('./words/nutrition'),
  require('./words/health'),
  require('./words/mind'),
  require('./words/daily'),
  require('./words/common'),
  require('./words/science'),
  require('./words/philosophy'),
  require('./words/ref') // 例句里常见、但用户不必作为生词来背的「参考词」：例句可点开看意思+读音，但不进学习队列
);

const idOf=text=>String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

// 同一个英文词只留第一次出现的（旧词优先），免得复习进度按 id 撞车
const seen=new Set();
const WORDS=[];
for(const x of CORE.concat(EXTRA)){
  const id=idOf(x.w);
  if(!id||seen.has(id))continue;
  seen.add(id);
  WORDS.push({...x,id,no:WORDS.length+1,catLabel:CATS[x.cat]||''});
}

// 补例句：只有两句的词（口语 + 说明）从 words-lines.js 拿第三句，一部分词还有第四句。
// 按 id 匹配，对不上就跳过 —— 少一句不会让页面崩，缺句子由 tests/words.test.js 报出来。
const {THIRD,FOURTH}=require('./words-lines');
const thirdById=new Map(THIRD.map(x=>[idOf(x.w),x]));
const fourthById=new Map(FOURTH.map(x=>[idOf(x.w),x]));
for(const w of WORDS){
  if(!w.ex2){const m=thirdById.get(w.id);if(m){w.ex2=m.en;w.ex2Zh=m.zh;}}
  if(!w.ex3){const m=fourthById.get(w.id);if(m){w.ex3=m.en;w.ex3Zh=m.zh;}}
}
// 手写词条里漏标词根的，用保守规则补（见 parts-auto.js 里的三条限制）
require('./parts-auto').fill(WORDS,require('./roots').ROOTS);

const BY_ID=new Map(WORDS.map(w=>[w.id,w]));

module.exports={WORDS,BY_ID,CATS};
