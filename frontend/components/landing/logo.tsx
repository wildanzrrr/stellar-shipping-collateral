import Image from "next/image"

/**
 * The Bunkr wordmark, cropped to content from the square source
 * (public/assets/images/logo.png → logo-wordmark*.png, 640×209).
 * Light/dark variants toggle via the `.dark` class (next-themes).
 */
export function BunkrLogo() {
  return (
    <span className="bk-logo">
      <Image
        src="/assets/images/logo-wordmark.png"
        alt="Bunkr"
        width={640}
        height={209}
        className="bk-logo__light"
      />
      <Image
        src="/assets/images/logo-wordmark-dark.png"
        alt="Bunkr"
        width={640}
        height={209}
        className="bk-logo__dark"
      />
    </span>
  )
}
