'use client';

import type { Variants } from 'motion/react';
import { motion, useAnimation } from 'motion/react';

const lidVariants: Variants = {
  normal: { y: 0 },
  animate: { y: -1.1 },
};

const springTransition = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
} as const;

const DeleteIcon = () => {
  const controls = useAnimation();

  return (
    <div
      className="flex cursor-pointer select-none items-center justify-center rounded-md p-2 transition-colors duration-200 hover:bg-accent"
      onMouseEnter={() => controls.start('animate')}
      onMouseLeave={() => controls.start('normal')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <title>Delete</title>
        <motion.g variants={lidVariants} animate={controls} transition={springTransition}>
          <path d="M3 6h18" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </motion.g>
        <motion.path
          d="M19 8v12c0 1-1 2-2 2H7c-1 0-2-1-2-2V8"
          variants={{
            normal: { d: 'M19 8v12c0 1-1 2-2 2H7c-1 0-2-1-2-2V8' },
            animate: { d: 'M19 9v12c0 1-1 2-2 2H7c-1 0-2-1-2-2V9' },
          }}
          animate={controls}
          transition={springTransition}
        />
        <motion.line
          x1="10"
          x2="10"
          y1="11"
          y2="17"
          variants={{
            normal: { y1: 11, y2: 17 },
            animate: { y1: 11.5, y2: 17.5 },
          }}
          animate={controls}
          transition={springTransition}
        />
        <motion.line
          x1="14"
          x2="14"
          y1="11"
          y2="17"
          variants={{
            normal: { y1: 11, y2: 17 },
            animate: { y1: 11.5, y2: 17.5 },
          }}
          animate={controls}
          transition={springTransition}
        />
      </svg>
    </div>
  );
};

export { DeleteIcon };
