const phases = [
  { code: "01", years: "2026-2027", title: "证明闭环", english: "PROVE", detail: "真实用户 · 两类终端 · 付费验证" },
  { code: "02", years: "2027-2029", title: "产品化", english: "PRODUCTIZE", detail: "State Runtime · SDK · 伙伴收入" },
  { code: "03", years: "2029-2032", title: "跨终端网络", english: "CONNECT", detail: "State Passport · 授权连续性" },
  { code: "04", years: "2032-2036", title: "开放标准", english: "STANDARDIZE", detail: "协议 · 生态 · 国际合作" },
];

export function RoadmapTimeline() {
  return (
    <div className="roadmap-timeline" aria-label="序感科技十年路线">
      <div className="roadmap-timeline__line" aria-hidden="true"><i /></div>
      <div className="roadmap-timeline__phases">
        {phases.map((phase) => (
          <article className="roadmap-phase group" key={phase.code}>
            <div className="roadmap-phase__marker"><span>{phase.code}</span></div>
            <time>{phase.years}</time>
            <span className="roadmap-phase__english">{phase.english}</span>
            <h3>{phase.title}</h3>
            <p>{phase.detail}</p>
          </article>
        ))}
      </div>
      <footer>
        <span>UNIFIED NORTH STAR</span>
        <p>Weekly Successful State Loops / 每周成功状态闭环</p>
      </footer>
    </div>
  );
}
