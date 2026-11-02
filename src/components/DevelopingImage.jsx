import { useState } from 'react'

// La foto aparece "revelándose": arranca oscura y sepia y toma color al cargar.
export const DevelopingImage = ({ src, alt, className = '' }) => {
  const [ready, setReady] = useState(false)
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`developing ${ready ? 'ready' : ''} ${className}`}
      onLoad={() => setReady(true)}
    />
  )
}
