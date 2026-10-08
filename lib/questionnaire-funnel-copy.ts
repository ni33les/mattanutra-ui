export const questionnaireFunnelCopy = {
  en: {
    title: "Where users stop", unit: "Questionnaire attempts", expand: "Question breakdown", question: "Question",
    reached: "Reached", continued: "Continued", active: "In progress", dropped: "Dropped off", rate: "Drop-off %",
    largest: "Largest drop-off", none: "No confirmed question drop-offs in this period.",
    note: "Drop-off means an unanswered question after 30 minutes without questionnaire activity. Resuming updates the count. Each attempt counts once per question; restarting begins a new attempt. Continued includes answers and optional skips.",
    evidence: "Only recorded question displays count as reached. Missing answer events remain unknown; questionnaire activity outside the selected period is checked for completion.",
    history: "Exact question unknown", historyNote: "Older tracking records the last answer, but cannot confirm the question left open.",
    transition: "Stopped between questions", submission_failed: "Submission failed", submission_pending: "Questions finished; submission pending",
    unavailable: "Questionnaire data unavailable", empty: "No question displays recorded in this period.",
    search: "Search attempts, email or IDs", lead: "Lead / attempt", lastSeen: "Last activity", lastAnswer: "Last answered or skipped",
    previous: "Previous", next: "Next", first: "First", last: "Last", pageSize: "Rows per page", loading: "Loading…",
    error: "Unable to load attempts. Try again.", retry: "Retry", details: "Open lead details", matches: "matching attempts",
    noAttempts: "No matching attempts.", missing: "Incomplete tracking", unknownQuestion: "Question unknown"
  },
  th: {
    title: "ผู้ใช้หยุดที่คำถามใด", unit: "การทำแบบสอบถามแต่ละครั้ง", expand: "รายละเอียดแต่ละคำถาม", question: "คำถาม",
    reached: "เข้าถึง", continued: "ไปต่อ", active: "กำลังทำ", dropped: "หยุดทำ", rate: "% หยุดทำ",
    largest: "คำถามที่มีผู้หยุดมากที่สุด", none: "ยังไม่มีการหยุดที่คำถามซึ่งยืนยันได้ในช่วงเวลานี้",
    note: "นับว่าหยุดทำเมื่อยังไม่ตอบคำถามและไม่มีกิจกรรมในแบบสอบถามเป็นเวลา 30 นาที เมื่อกลับมาทำต่อจำนวนจะปรับใหม่ นับแต่ละครั้งเพียงหนึ่งครั้งต่อคำถาม การเริ่มใหม่ถือเป็นครั้งใหม่ การไปต่อรวมการตอบและการข้ามคำถามที่ไม่บังคับ",
    evidence: "นับการเข้าถึงเฉพาะคำถามที่มีบันทึกว่าแสดงแล้ว หากไม่มีบันทึกคำตอบจะแสดงว่าไม่ทราบ และตรวจสอบกิจกรรมนอกช่วงเวลาที่เลือกเพื่อยืนยันการทำเสร็จ",
    history: "ไม่ทราบคำถามที่หยุดแน่ชัด", historyNote: "ข้อมูลเก่ามีคำตอบล่าสุด แต่ยืนยันไม่ได้ว่าผู้ใช้หยุดที่คำถามใด",
    transition: "หยุดระหว่างเปลี่ยนคำถาม", submission_failed: "ส่งแบบสอบถามไม่สำเร็จ", submission_pending: "ตอบเสร็จแล้ว รอส่งแบบสอบถาม",
    unavailable: "ไม่สามารถโหลดข้อมูลแบบสอบถามได้", empty: "ไม่มีบันทึกการแสดงคำถามในช่วงเวลานี้",
    search: "ค้นหาการทำแบบสอบถาม อีเมล หรือรหัส", lead: "ผู้สนใจ / การทำแบบสอบถาม", lastSeen: "กิจกรรมล่าสุด", lastAnswer: "คำถามที่ตอบหรือข้ามล่าสุด",
    previous: "ก่อนหน้า", next: "ถัดไป", first: "หน้าแรก", last: "หน้าสุดท้าย", pageSize: "จำนวนแถวต่อหน้า", loading: "กำลังโหลด…",
    error: "โหลดรายการไม่สำเร็จ โปรดลองอีกครั้ง", retry: "ลองอีกครั้ง", details: "เปิดรายละเอียดผู้สนใจ", matches: "รายการที่ตรงกัน",
    noAttempts: "ไม่มีรายการที่ตรงกัน", missing: "ข้อมูลติดตามไม่ครบ", unknownQuestion: "ไม่ทราบคำถาม"
  },
  "zh-CN": {
    title: "用户停在哪道题", unit: "问卷作答次数", expand: "逐题明细", question: "问题", reached: "到达", continued: "继续",
    active: "进行中", dropped: "流失", rate: "流失率", largest: "流失最多的问题", none: "此期间暂无已确认的问题流失。",
    note: "问题尚未回答且问卷连续30分钟无活动时计为流失。用户返回后更新数量。每次作答在每题只计一次；重新开始计为新的作答。继续包括回答和跳过选答题。",
    evidence: "仅记录已显示的问题。缺失的回答事件标为未知；也检查所选期间之外的问卷活动以确认完成。",
    history: "具体问题未知", historyNote: "旧记录有最后的回答，但无法确认离开时显示的问题。",
    transition: "停在问题切换之间", submission_failed: "提交失败", submission_pending: "答题完成，等待提交",
    unavailable: "问卷数据暂不可用", empty: "此期间没有问题显示记录。", search: "搜索作答、邮箱或ID",
    lead: "潜在客户 / 作答", lastSeen: "最后活动", lastAnswer: "最后回答或跳过的问题",
    previous: "上一页", next: "下一页", first: "首页", last: "末页", pageSize: "每页行数", loading: "加载中…",
    error: "无法加载，请重试。", retry: "重试", details: "打开客户详情", matches: "条匹配作答",
    noAttempts: "没有匹配的作答。", missing: "追踪不完整", unknownQuestion: "问题未知"
  }
};
