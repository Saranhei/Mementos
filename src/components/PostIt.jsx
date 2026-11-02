// Nota adhesiva con cinta. tone: yellow | pink | blue | green.
// La inclinación sale de `seed` para que cada nota quede siempre igual (no "tiembla" al re-renderizar).
export const PostIt = ({ tone = 'yellow', seed = 0, size = 'md', as: Tag = 'div', className = '', children, ...rest }) => {
  const tilt = (((seed * 53) % 5) - 2) * 0.6
  return (
    <Tag className={`postit ${tone} ${size} ${className}`} style={{ '--tilt': `${tilt}deg` }} {...rest}>
      <span className="postit-tape" aria-hidden="true" />
      {children}
    </Tag>
  )
}
