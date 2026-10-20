// "landing" messages (home page for signed-out visitors). zh must have exactly the same keys.
export const en = {
  signIn: "Sign in",
  createAccount: "Create account",
  headline: "Log what you eat and what you lift.",
  intro:
    "Describe a meal or snap a photo and AI works out the calories and macros. Your workouts, training plan and progress sit right next to it.",
  sampleCaption: "A sample day. Each plate is the calories from protein, carbs or fat; the collar is your target.",
  disclaimer: "Nutrition estimates are approximate and not medical advice.",
  features: {
    meals: "Meals",
    mealsBody:
      "Type what you ate or take a photo. AI lists each item with calories, protein, carbs, fat, fiber, sugar and sodium, and you adjust the grams before saving. It knows roti canai from roti john.",
    workouts: "Workouts",
    workoutsBody:
      "Log sets in a couple of taps. You see what you lifted last time, a suggested next weight, and a rest timer that starts on its own. New records are flagged as you set them.",
    plans: "Plans",
    plansBody:
      "Tell it your goal, days per week, session length, equipment and any injuries. You get a plan built from a real exercise library, and you can edit every set.",
    progress: "Progress",
    progressBody: "Body-weight trend, calories and protein against target, sets per muscle and strength over time.",
    coach: "Coach",
    coachBody:
      "Ask about your training or eating. The coach reads your logs, and can propose new targets or a new plan that only change when you approve them.",
  },
};

export const zh: typeof en = {
  signIn: "登录",
  createAccount: "创建账户",
  headline: "记录你吃的，也记录你练的。",
  intro: "描述一餐或拍张照片，AI 就会算出热量和三大营养素。你的训练、训练计划和进度都在旁边。",
  sampleCaption: "示例的一天。每片杠铃片代表蛋白质、碳水或脂肪提供的热量；卡扣是你的目标。",
  disclaimer: "营养估算仅供参考，不构成医疗建议。",
  features: {
    meals: "饮食",
    mealsBody:
      "输入你吃了什么或拍张照片。AI 会列出每样食物的热量、蛋白质、碳水、脂肪、膳食纤维、糖和钠，保存前你可以调整克数。它分得清 roti canai 和 roti john。",
    workouts: "训练",
    workoutsBody: "轻点几下就能记录一组。你能看到上次举了多少、建议的下次重量，以及自动开始的组间休息计时。破纪录时会立即提示。",
    plans: "计划",
    plansBody: "告诉它你的目标、每周天数、每次时长、器械和伤病情况。你会得到一份基于真实动作库的计划，每一组都可以修改。",
    progress: "进度",
    progressBody: "体重趋势、热量和蛋白质对比目标、各肌群组数以及力量的长期变化。",
    coach: "教练",
    coachBody: "问问训练或饮食方面的问题。教练会读取你的记录，可以提议新的目标或新计划，只有你同意后才会生效。",
  },
};
