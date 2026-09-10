/** Shared authored meaning used by schemas, cards, instructions and discovery. */
export const IMPORTANCE_EXPLANATION = 'Targets and preferences describe the desired outcome. Weights describe its importance when comparing choices. Weights accept decimals from 0 to 2: zero removes that ranking component, one applies the normal penalty, and two doubles it. Changing a weight never changes the agreed target amount. Numerical preferences remain advisory. Safety penalties and factual advice remain active independently.';
export const ZERO_TARGET_EXPLANATION = 'A target amount of zero with a positive weight expresses soft minimisation. A weight of zero means that objective does not influence ranking. Use an exclusion only when the customer requires categorical avoidance.';
export function importanceInstructions(locale?: string) {
  const meaning = locale === 'th'
    ? 'เป้าหมายและความต้องการบอกผลลัพธ์ที่ต้องการ น้ำหนักบอกความสำคัญในการเปรียบเทียบ รับทศนิยม 0 ถึง 2: ศูนย์ไม่นำองค์ประกอบนั้นมาคิดคะแนน หนึ่งคือปกติ สองเพิ่มโทษเป็นสองเท่า การเปลี่ยนน้ำหนักไม่เปลี่ยนปริมาณเป้าหมาย คำแนะนำและโทษด้านความปลอดภัยยังคงอยู่ เป้าหมายปริมาณศูนย์ร่วมกับน้ำหนักบวกหมายถึงลดการได้รับให้มากที่สุดเท่าที่เหมาะสม ไม่ใช่ข้อห้าม หากต้องหลีกเลี่ยงเด็ดขาดให้ใช้การยกเว้น'
    : locale === 'zh-CN' || locale === 'zh'
      ? '目标与偏好描述期望结果，权重表示比较时的重要性。接受0到2的小数：0移除该评分项，1采用正常惩罚，2将其加倍。改变权重不会改变约定目标量。数值偏好仅供建议，安全惩罚与事实建议独立保留。目标量为0且权重为正表示尽量减少摄入；权重为0仅表示忽略该目标的评分。必须完全避免时请使用排除条件。'
      : '';
  return `${IMPORTANCE_EXPLANATION} ${ZERO_TARGET_EXPLANATION}${meaning ? `\n${meaning}` : ''}`;
}
