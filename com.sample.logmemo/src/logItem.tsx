import { ListItem, Box } from '@mui/material';
import React from 'react';

export default function LogItem({ log, key }: { log: string; key: number }) {
  return (
    <ListItem
      key={key}
      sx={{
        borderBottom: '1px solid #eee',
        padding: '8px',
      }}
    >
      <Box sx={{ fontSize: '14px' }}>{log}</Box>
    </ListItem>
  );
}
