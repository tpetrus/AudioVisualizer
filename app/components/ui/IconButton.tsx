import { buttonClasses, type ButtonProps } from './Button';

export type IconButtonProps = ButtonProps & { 'aria-label': string };

// A square button with no visible text, so the accessible name must come from aria-label.
export function IconButton({
    variant = 'ghost',
    size = 'md',
    type = 'button',
    className,
    ref,
    ...rest
}: IconButtonProps) {
    return <button ref={ref} type={type} className={buttonClasses(variant, size, true, className)} {...rest} />;
}
