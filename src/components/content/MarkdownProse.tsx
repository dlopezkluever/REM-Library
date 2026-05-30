import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

interface MarkdownProseProps {
  value: string | null
  className?: string
}

export const MarkdownProse = ({ className, value }: MarkdownProseProps) => {
  if (!value?.trim()) {
    return null
  }

  const blocks = value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return (
    <div className={className}>
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a className="text-verdigris hover:text-verdigris-dark" {...props} />
          ),
          li: ({ ...props }) => (
            <li
              className="ml-5 list-disc font-body text-[14px] leading-reading text-ink"
              {...props}
            />
          ),
          p: ({ ...props }) => (
            <p
              className="mb-4 font-body text-[14px] leading-reading text-ink last:mb-0"
              {...props}
            />
          ),
        }}
      >
        {blocks.join('\n\n')}
      </ReactMarkdown>
    </div>
  )
}
