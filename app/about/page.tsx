export const metadata = {
  title: 'Access & content statement | NYC Collections Browser'
};

export default function AboutPage() {
  return (
    <div className="prose max-w-3xl">
      <h1>Access & content statement</h1>
      <p>
        The NYC Collections Browser provides local-first access to materials stewarded by the Department of Records and
        Information Services. Historical records may contain outdated, offensive, or harmful language and imagery. We
        present them to support research, accountability, and reparative description work.
      </p>
      <p>
        We follow archival best practices informed by Dublin Core, the Municipal Archives&apos; reparative description
        commitments, and agency guidance around respectful description. Where descriptive language is under review, we
        flag items with a content advisory.
      </p>
      <p>
        If you encounter harmful description, missing context, or accessibility issues, please submit a report. Our
        archivists review feedback regularly and prioritize remediation that centers affected communities.
      </p>
      <h2>How we remediate</h2>
      <ul>
        <li>We retain original creator-supplied metadata for transparency.</li>
        <li>We add contextual notes and inclusive naming updates where appropriate.</li>
        <li>We document provenance, rights, and fixity checksums for each item.</li>
      </ul>
      <p>
        This site runs entirely offline. No search terms or usage data are sent to third parties. For more information
        about our archival program, contact research@records.nyc.gov.
      </p>
    </div>
  );
}
