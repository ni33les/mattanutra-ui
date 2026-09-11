/** Shared authored meaning used by schemas, cards, instructions and discovery. */
export const IMPORTANCE_EXPLANATION = 'Targets and preferences describe the desired outcome. Weights describe its importance when comparing possible routines. Weights accept decimals from 0 to 2: zero removes that ranking component, one applies the normal penalty, and two doubles it. Changing a weight never changes the agreed target amount. Numerical preferences remain advisory. Safety penalties and factual advice remain active independently.';
export const ZERO_TARGET_EXPLANATION = 'A target amount of zero with a positive weight expresses soft minimisation. A weight of zero means that objective does not influence ranking. Use an exclusion only when the customer requires categorical avoidance.';
export const COST_WEIGHT_EXPLANATION = 'Cost weight: scoring.weights.price (0 to 2) controls first-order goods cost in THB, delivery excluded. 0 ignores the cost penalty; 1 is normal; 2 doubles it. With requirements.maxPriceMinor, it weights budget-overrun penalties instead. Omission preserves; null resets to the preset.';
export function importanceInstructions(locale?: string) {
  const meaning = locale === 'th'
    ? 'เป้าหมายและความต้องการบอกผลลัพธ์ที่ต้องการ น้ำหนักบอกความสำคัญในการเปรียบเทียบ รับทศนิยม 0 ถึง 2: ศูนย์ไม่นำองค์ประกอบนั้นมาคิดคะแนน หนึ่งคือปกติ สองเพิ่มโทษเป็นสองเท่า การเปลี่ยนน้ำหนักไม่เปลี่ยนปริมาณเป้าหมาย คำแนะนำและโทษด้านความปลอดภัยยังคงอยู่ เป้าหมายปริมาณศูนย์ร่วมกับน้ำหนักบวกหมายถึงลดการได้รับให้มากที่สุดเท่าที่เหมาะสม ไม่ใช่ข้อห้าม หากต้องหลีกเลี่ยงเด็ดขาดให้ใช้การยกเว้น'
    : locale === 'zh-CN' || locale === 'zh'
      ? '目标与偏好描述期望结果，权重表示比较时的重要性。接受0到2的小数：0移除该评分项，1采用正常惩罚，2将其加倍。改变权重不会改变约定目标量。数值偏好仅供建议，安全惩罚与事实建议独立保留。目标量为0且权重为正表示尽量减少摄入；权重为0仅表示忽略该目标的评分。必须完全避免时请使用排除条件。'
      : '';
  const cost = locale === 'th'
    ? 'น้ำหนักค่าใช้จ่ายใช้ scoring.weights.price ตั้งแต่ 0 ถึง 2 สำหรับราคาสินค้าในการสั่งซื้อครั้งแรกเป็นบาท ไม่รวมค่าจัดส่ง เมื่อระบุ maxPriceMinor จะให้น้ำหนักแก่ส่วนที่เกินงบแทน 0 ไม่คิดโทษด้านค่าใช้จ่าย 1 ปกติ 2 สองเท่า'
    : locale === 'zh-CN' || locale === 'zh'
      ? '费用权重使用 scoring.weights.price，范围为0到2，针对首次购买的商品金额（泰铢），不含运费。设有 maxPriceMinor 时，改为对超预算部分加权。0忽略费用惩罚，1为正常，2为两倍。'
      : '';
  return `${IMPORTANCE_EXPLANATION} ${ZERO_TARGET_EXPLANATION} ${COST_WEIGHT_EXPLANATION}${meaning ? `\n${meaning} ${cost}` : ''}`;
}
