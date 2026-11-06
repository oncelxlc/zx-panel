/** 固定深色线稿仅作装饰；加载失败时隐藏图片，表单仍在底色上正常使用。 */
export function LoginBackground() {
  return (
    <div className="login-page__background" aria-hidden="true">
      <img
        className="login-page__image"
        src="/login/login-bg-lines.webp"
        alt=""
        width={1672}
        height={941}
        decoding="async"
        onError={(event) => { event.currentTarget.hidden = true; }}
      />
    </div>
  );
}
