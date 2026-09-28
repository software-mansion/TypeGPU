import { privacyPolicyUrl, softwareMansionUrl } from '../utils/legalLinks.ts';

export const legalFooterLineClass = 'text-navy-100 dark:text-almost-white text-center text-sm';

interface LegalFooterLineProps {
  className?: string;
}

export function LegalFooterLine({ className }: LegalFooterLineProps) {
  return (
    <p className={className}>
      &copy;{' '}
      <a
        href={softwareMansionUrl}
        target="_blank"
        rel="noopener"
        className="text-inherit underline"
      >
        Software Mansion
      </a>{' '}
      {new Date().getFullYear()}. All trademarks and copyrights belong to their respective owners.{' '}
      <span className="whitespace-nowrap">
        Read about our{' '}
        <a
          href={privacyPolicyUrl}
          target="_blank"
          rel="noopener"
          className="text-inherit underline"
        >
          Privacy Policy
        </a>
        .
      </span>
    </p>
  );
}
