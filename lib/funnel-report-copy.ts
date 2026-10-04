export const funnelReportCopy = {
  en: {
    web: "Web", visits: "Web visits", reached: "HealthScore reached",
    webNote: "Web only, including direct quiz arrivals. Counts are distinct journeys in this period. Conversion and drop-off use the same journey at both stages; missing steps are never inferred.",
    evidence: "HealthScore: {displayed} confirmed displays; {arrivals} page arrivals without display confirmation.",
    mcp: "MCP plan journey", mcpNote: "Distinct plan journeys from the MCP server. Starts mean plans created, not connector installations. This table uses the selected period; website campaign filters do not apply. Known QA activity is shown separately.",
    unavailable: "Data unavailable", empty: "No recorded activity in this period.",
    live: "Connector activity", qa: "QA activity", unknown: "Unknown", language: "Language",
    linkedNote: "Rates require recorded stages in the same journey. A dash means there is no usable denominator.",
    mcpStages: ["Plans started", "Plans ready", "Orders confirmed", "Checkouts created", "Payments confirmed", "Dispatched", "Delivered"]
  },
  th: {
    web: "Web", visits: "การเข้าชมเว็บ", reached: "เข้าถึงหน้า HealthScore",
    webNote: "เฉพาะเว็บ รวมการเข้าแบบประเมินโดยตรง นับเส้นทางที่ไม่ซ้ำในช่วงเวลานี้ อัตราการไปต่อและการไม่ไปต่ออ้างอิงเส้นทางเดียวกันทั้งสองขั้นตอน ไม่อนุมานขั้นตอนที่ขาดหาย",
    evidence: "HealthScore: ยืนยันการแสดงผล {displayed} รายการ; เข้าหน้าแล้วแต่ยังไม่ยืนยันการแสดงผล {arrivals} รายการ",
    mcp: "เส้นทางแผนผ่าน MCP", mcpNote: "นับเส้นทางแผนที่ไม่ซ้ำจากเซิร์ฟเวอร์ MCP การเริ่มหมายถึงสร้างแผน ไม่ใช่ติดตั้งตัวเชื่อมต่อ ตารางนี้ใช้ช่วงเวลาที่เลือก ตัวกรองแคมเปญเว็บไม่มีผล แยกกิจกรรม QA ที่ระบุไว้",
    unavailable: "ไม่สามารถโหลดข้อมูลได้", empty: "ไม่มีกิจกรรมที่บันทึกในช่วงเวลานี้",
    live: "กิจกรรมตัวเชื่อมต่อ", qa: "กิจกรรม QA", unknown: "ไม่ทราบ", language: "ภาษา",
    linkedNote: "อัตราต้องมีขั้นตอนที่บันทึกในเส้นทางเดียวกัน ขีดหมายถึงไม่มีฐานคำนวณที่ใช้ได้",
    mcpStages: ["เริ่มสร้างแผน", "แผนพร้อม", "ยืนยันคำสั่งซื้อ", "สร้างหน้าชำระเงิน", "ยืนยันชำระเงิน", "จัดส่งแล้ว", "ส่งถึงแล้ว"]
  },
  "zh-CN": {
    web: "Web", visits: "网站访问", reached: "到达 HealthScore 页面",
    webNote: "仅统计网站流程，包括直接进入问卷。数量为所选期间的不重复流程。转化和流失根据同一流程的两个阶段计算，不推断缺失步骤。",
    evidence: "HealthScore：{displayed} 次已确认显示；{arrivals} 次到达页面但未确认显示。",
    mcp: "MCP 方案流程", mcpNote: "统计 MCP 服务器中的不重复方案流程。开始代表创建方案，不代表安装连接器。此表使用所选期间，不应用网站广告系列筛选条件。已标记的 QA 活动单独显示。",
    unavailable: "数据暂不可用", empty: "此期间没有已记录的活动。",
    live: "连接器活动", qa: "QA 活动", unknown: "未知", language: "语言",
    linkedNote: "比率需要同一流程中有记录的阶段。破折号表示没有可用的计算基数。",
    mcpStages: ["开始方案", "方案就绪", "确认订单", "创建结账", "确认付款", "已发货", "已送达"]
  }
};
