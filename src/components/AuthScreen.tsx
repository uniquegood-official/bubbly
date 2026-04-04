interface Props {
  onGoogle: () => void;
  onGithub: () => void;
  loading: boolean;
}

export default function AuthScreen({ onGoogle, onGithub, loading }: Props) {
  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <div className="auth-logo">Bubbly</div>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">Bubbly</div>
        <p className="auth-tagline">할 일을 버블로 관리하세요</p>

        <div className="auth-buttons">
          <button className="auth-btn google" onClick={onGoogle}>
            Google로 시작
          </button>
          <button className="auth-btn github" onClick={onGithub}>
            GitHub로 시작
          </button>
        </div>

        <p className="auth-footer">로그인하면 공유 및 동기화가 가능합니다</p>
      </div>
    </div>
  );
}
