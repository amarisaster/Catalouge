interface EmptyStateProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      {/* Decorative shelf line with Neko sleeping on it */}
      <div className="relative w-full max-w-xs">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-[3px] bg-gradient-to-r from-transparent via-cream-400 dark:via-bark-500 to-transparent rounded-full" />
        <img
          src="/neko-sleeping.png"
          alt="Neko sleeping"
          className="w-44 h-44 object-contain mx-auto relative z-10 mb-[-6px] drop-shadow-md"
        />
      </div>

      <h3 className="text-lg font-bold text-bark-600 dark:text-cream-400 mt-4">{title}</h3>
      {subtitle && (
        <p className="text-sm text-bark-400 dark:text-cream-500 mt-1 max-w-xs text-center">
          {subtitle}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
