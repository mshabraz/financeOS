import { usePrivacy } from '../../context/PrivacyContext';
import { maskIfPrivacy, maskTextIfPrivacy } from '../../utils/privacyMask';

/** Display-only mask for amounts or text (does not change underlying data). */
export default function Private({ children, text, mode = 'amount' }) {
  usePrivacy();
  const raw = text ?? children;
  if (raw == null || raw === '') return null;
  const masked = mode === 'text' ? maskTextIfPrivacy(raw) : maskIfPrivacy(String(raw));
  return <>{masked}</>;
}
