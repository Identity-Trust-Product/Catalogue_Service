// 'use client'

// import { useCatalogue } from '../context/CatalogueContext'

// export default function HomePage() {
//   const { setView } = useCatalogue()

//   return (
//     <div className="home-screen">
//       <div className="home-topbar">
//         <div className="brand-mark"><span className="brand-icon">O</span><span>Identity OS</span></div>
//         <div className="topbar-right"><span className="version-label">v2.5.8</span><div className="status-pill"><span className="status-dot" />All Systems Operational</div></div>
//       </div>
//       <section className="hero-block">
//         <div className="hero-copy">
//           <div className="brand-label"><span className="badge-spark">+</span>Enterprise Identity &amp; Access Management</div>
//           <h1>Identity <span>OS</span></h1>
//           <p>Secure organization onboarding, identity management, and authentication at enterprise scale.</p>
//         </div>
//         <div className="role-stack">
//           <button type="button" className="role-card primary" onClick={() => setView('registration')}><span className="role-icon role-icon-blue">ID</span><span className="role-card-title">Register Organization</span><span className="role-card-subtitle">Onboard your organization to Identity OS</span><span className="role-card-action">Start Registration <span>-&gt;</span></span></button>
//           <button type="button" className="role-card admin-card" onClick={() => setView('platform')}><span className="role-icon role-icon-purple">S</span><span className="role-card-title">Platform Admin</span><span className="role-card-subtitle">Review organizations, apps &amp; schemas</span><span className="role-card-action">Admin Login <span>-&gt;</span></span></button>
//           <button type="button" className="role-card org-card" onClick={() => setView('organization')}><span className="role-icon role-icon-green">G</span><span className="role-card-title">Organization Admin</span><span className="role-card-subtitle">Manage identity configuration</span><span className="role-card-action">Org Admin Login <span>-&gt;</span></span></button>
//         </div>
//       </section>
//       <section className="stats-grid">
//         <div className="stat-box"><strong>1,200+</strong><span>Organizations Onboarded</span></div>
//         <div className="stat-box"><strong>48M+</strong><span>Identities Managed</span></div>
//         <div className="stat-box"><strong>99.99%</strong><span>Uptime SLA</span></div>
//       </section>
//     </div>
//   )
// }


'use client'

import { useCatalogue } from '../context/CatalogueContext'
import { Building2, UserCog } from 'lucide-react'


export default function HomePage() {
  const { setView } = useCatalogue()

  return (
    <div className="home-screen">
      <section className="hero-block">
        <div className="hero-copy">
          <div className="brand-label">
            <span className="badge-spark">+</span>
            Enterprise Identity &amp; Access Management
          </div>

          <h1>
            Identity <span>OS</span>
          </h1>

          <p>
            Secure organization onboarding, identity management,
            and authentication at enterprise scale.
          </p>
        </div>

        <div className="role-stack">

          {/* Register Organization */}
          <button
            type="button"
            className="role-card primary"
            onClick={() => setView('registration')}
          >
            {/* <span className="role-icon role-icon-blue">RO</span> */}

            <span className="role-icon role-icon-blue">
              <Building2 size={28} strokeWidth={2} />
            </span>
            <span className="role-card-title">
              Register Organization
            </span>

            <span className="role-card-subtitle">
              Onboard your organization to Identity OS
            </span>

            <span className="role-card-action">
              Start Registration <span>-&gt;</span>
            </span>
          </button>


          {/* Organization Admin */}
          <button
            type="button"
            className="role-card org-card"
            onClick={() => setView('organization')}
          >
            {/* <span className="role-icon role-icon-green">OA</span> */}
            <span className="role-icon role-icon-green">
              <UserCog size={28} strokeWidth={2} />
            </span>
            <span className="role-card-title">
              Organization Admin
            </span>

            <span className="role-card-subtitle">
              Manage identity configuration
            </span>

            <span className="role-card-action">
              Org Admin Login <span>-&gt;</span>
            </span>
          </button>

        </div>
      </section>

      <section className="stats-grid">
        <div className="stat-box">
          <strong>1,200+</strong>
          <span>Organizations Onboarded</span>
        </div>

        <div className="stat-box">
          <strong>48M+</strong>
          <span>Identities Managed</span>
        </div>

        <div className="stat-box">
          <strong>99.99%</strong>
          <span>Uptime SLA</span>
        </div>
      </section>
    </div>
  )
}
