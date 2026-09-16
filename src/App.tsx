const highlights = [
  'Full-stack products',
  'Clean UX and systems thinking',
  'Real-world delivery',
];

const metrics = [
  { value: '5+', label: 'Years building' },
  { value: '20+', label: 'Projects shipped' },
  { value: '100%', label: 'Curious and hands-on' },
];

function App() {
  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand">Your Name</div>
        <nav className="nav" aria-label="Main navigation">
          <a href="#about">About</a>
          <a href="#work">Work</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Software engineer • builder • problem solver</p>
            <h1>I design and ship products that people actually use.</h1>
            <p className="lede">
              I build thoughtful digital experiences with a strong focus on practical,
              scalable, and human-centered product work.
            </p>
            <div className="actions">
              <a className="button primary" href="#work">View work</a>
              <a className="button secondary" href="#contact">Let’s talk</a>
            </div>
            <ul className="tag-list" aria-label="Core strengths">
              {highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="hero-card" aria-label="Profile summary card">
            <div className="avatar">YN</div>
            <div className="card-meta">
              <strong>Available for product and engineering work</strong>
              <span>Remote • collaborative • product-minded</span>
            </div>
          </div>
        </section>

        <section className="metrics" aria-label="Key metrics">
          {metrics.map((metric) => (
            <div key={metric.label} className="metric-item">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </section>

        <section id="about" className="content-section">
          <div className="section-heading">
            <p className="eyebrow">About</p>
            <h2>Building with intent.</h2>
          </div>
          <div className="about-grid">
            <p>
              I’m a software builder passionate about turning ambiguous ideas into clear,
              useful digital experiences. I care deeply about product clarity, good design,
              and building systems that scale without losing usability.
            </p>
            <p>
              My work sits at the intersection of engineering and product thinking: from
              product strategy and UX to implementation, iteration, and deployment.
            </p>
          </div>
        </section>

        <section id="work" className="content-section">
          <div className="section-heading">
            <p className="eyebrow">Selected work</p>
            <h2>Recent projects.</h2>
          </div>

          <div className="project-grid">
            <article className="project-card">
              <span className="project-type">Product</span>
              <h3>Operations dashboard</h3>
              <p>
                Built a workflow dashboard for internal operations, helping teams move faster
                with clearer status tracking and fewer manual handoffs.
              </p>
            </article>

            <article className="project-card">
              <span className="project-type">Platform</span>
              <h3>Customer portal</h3>
              <p>
                Designed and implemented a customer-facing portal with improved onboarding,
                visibility, and service access across key touchpoints.
              </p>
            </article>

            <article className="project-card">
              <span className="project-type">Experience</span>
              <h3>UX-driven web app</h3>
              <p>
                Shipped a lightweight app focused on conversion, clarity, and responsive
                interaction patterns for a growing digital product.
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer id="contact" className="footer">
        <div>
          <p className="eyebrow">Let’s connect</p>
          <h2>Available for product and engineering work.</h2>
        </div>
        <a className="button primary" href="mailto:hello@example.com">hello@example.com</a>
      </footer>
    </div>
  );
}

export default App;
