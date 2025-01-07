/*
    BSD 3-Clause License
    Copyright (c) 2023, Doosan Robotics Inc.
*/
import {
  BaseModule,
  ModuleScreen,
  ModuleScreenProps,
  System,
  ModuleContext,
  IProgramManager,
  Context,
  IFilePicker,
  logger,
} from 'dart-api';
import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import DrlUtils from './DrlUtils';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Box,
  List,
  Container,
  Typography,
  Tooltip,
  Link,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import LogItem from './logItem';

const sampleDrlCode = `#Sample1. get tp_log() from DRL
tp_log("Hello? This is tp_log()")
for i in range(1000):
    tp_log("[Log Test] Count:" + str(i))
    wait(0.1)

#Sample2. get event message from DRL
event, data = message_to_dp("com.sample.logmemo_EVENT_TEST_BOOL", "Hello? This is EVENT_TEST_BOOL message_to_dp()")
tp_popup("Reply: " + str(data))
event, data = message_to_dp("com.sample.logmemo_EVENT_TEST_INT", "Hello? This is EVENT_TEST_INT message message_to_dp()")
tp_popup("Reply: " + str(data))
event, data = message_to_dp("com.sample.logmemo_EVENT_TEST_NO", "Hello? This is EVENT_TEST_NO message message_to_dp(). Since the module will not send a response, the DRL program will be in an infinite waiting state.")
#Always pending in here
tp_popup("Reply: " + str(data))
`;

const UsageGuide = `Usage Guide
1. Install Dart-Platform > Store module > Code Editor module
2. Copy DRL Sample Code and paste to Code Editor or Custom Code in Task Editor
3. Run Code at Servo ON State and Auto Mode
4. Click Export Button for saving the logs to file.
5. If you want to clear the logs, click Clear Button.
`;

// IIFE for register a function to create an instance of main class which is inherited BaseModule.
(() => {
  System.registerModuleMainClassCreator(
    (packageInfo) => new Module(packageInfo),
  );
})();
class Module extends BaseModule {
  getModuleScreen(componentId: string) {
    if (componentId === 'MainScreen') {
      return MainScreen;
    }
    return null;
  }
}
class MainScreen extends ModuleScreen {
  constructor(props: ModuleScreenProps) {
    super(props);
  }
  componentWillUnmount() {
    // Must delete DrlUtils Instance to free up memory
    DrlUtils.deleteInstance();
  }
  render() {
    return (
      <ThemeProvider theme={this.systemTheme}>
        <App moduleContext={this.moduleContext} />
      </ThemeProvider>
    );
  }
}

interface IAppProps {
  moduleContext: ModuleContext;
}
function App(props: IAppProps) {
  const moduleContext = props.moduleContext;
  const { t } = useTranslation();
  const [logs, setLogs] = React.useState<string[]>([]);
  const listRef = React.useRef<HTMLDivElement>(null);

  ///dart-api: https://apis.drdart.io/classes/dart_api.Context.html#getSystemManager
  const programManager = moduleContext.getSystemManager(
    Context.PROGRAM_MANAGER,
  ) as IProgramManager;
  //dart-api: https://apis.drdart.io/classes/dart_api.Context.html#getSystemLibrary
  const fileSystem = props.moduleContext.getSystemLibrary(
    Context.FILE_PICKER,
  ) as IFilePicker;

  const getTimeString = () => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const [date, time] = timeString.split(', ');
    const [dd, mm, yyyy] = date.split('/');
    return `${dd}/${mm}/${yyyy}, ${time}`;
  };

  React.useEffect(() => {
    //this called once when component is mounted
    const handleUserEvent = (event: { data: string; eventName: string }) => {
      //using this code, you can filter the event name
      //event name must be unique because events are sent to all modules
      //if (event.eventName !== 'com.sample.logmemo_log') return;

      const timeString = getTimeString();
      setLogs((prev) => [
        ...prev,
        `[${timeString}] [event name: ${event.eventName}] ${event.data}`,
      ]);

      //event response from com.sample.logmemo module
      if (event.eventName === 'com.sample.logmemo_EVENT_TEST_BOOL') {
        programManager.sendUserEventResponse(event.eventName, 'TRUE');
        return;
      } else if (event.eventName === 'com.sample.logmemo_EVENT_TEST_INT') {
        programManager.sendUserEventResponse(event.eventName, '0');
        return;
      } else if (event.eventName === 'com.sample.logmemo_EVENT_TEST_NO') {
        return;
      }

      //default response
      //dart-api: https://apis.drdart.io/interfaces/dart_api.IProgramManager.html#sendUserEventResponse
      programManager.sendUserEventResponse(event.eventName, 'TRUE');
    };

    const handleUserLog = (log: string) => {
      const timeString = getTimeString();
      setLogs((prev) => [...prev, `${timeString} ${log}`]);
    };

    //add userEvent listener
    //dart-api: https://apis.drdart.io/classes/dart_api.Monitorable.html#register
    programManager.userEvent.register(moduleContext, handleUserEvent, false);
    programManager.userLog.register(moduleContext, handleUserLog, false);

    //this called once before component will be unmounted
    return () => {
      //delete userEvent
      //dart-api: https://apis.drdart.io/classes/dart_api.Monitorable.html#unregister
      programManager.userEvent.unregister(moduleContext, handleUserEvent);
      programManager.userLog.unregister(moduleContext, handleUserLog);
    };
  }, []);

  //auto scroll
  React.useEffect(() => {
    if (listRef.current) {
      //when new log is added, scroll to the bottom
      //setTimeout is used to ensure scroll action is performed after DOM update is complete.
      //There may be a slight time difference between React state update and actual DOM rendering,
      //setTimeout is used to ensure scroll action is performed after DOM update is complete.
      setTimeout(() => {
        listRef.current?.scrollTo({
          top: listRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [logs]);

  const handleButtonClick = () => {
    showSaveFilePicker();
  };

  // showSaveFilePicker
  // dart-api: https://apis.drdart.io/interfaces/dart_api.IFilePicker.html
  const showSaveFilePicker = async () => {
    try {
      /*************
       *  1) set File Explorer options
       **************
       *  suggestedName : default saved file name.
       *  types
       *   - description : file option name (name is free)
       *   - mimeType, extensions : check this link - https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
       **************/
      const option = {
        suggestedName: 'logs',
        types: [
          {
            description: 'JSON file',
            mimeType: 'application/json',
            extensions: ['.json'],
          },
          {
            description: 'text file',
            mimeType: 'text/plain',
            extensions: ['.txt'],
          },
        ],
      };

      /*************
       *  2) call save file picker
       **************/
      const fileHandle = await fileSystem.showSaveFilePicker(option);

      /*************
       *  3) convert data to string
       *  In this example, data will be saved to json format
       **************/
      const jsonString = JSON.stringify(logs, null, 1);

      /*************
       *  4) save it to file
       **************/
      const writeResult = await fileHandle.handler?.write(jsonString);
      logger.debug('write : ' + JSON.stringify(writeResult));
      return writeResult;
    } catch (err) {
      logger.debug(JSON.stringify(err));
      return false;
    }
  };

  // Clear button handler
  const handleClearClick = () => {
    setLogs([]);
  };

  const [helpText] = React.useState(UsageGuide);

  return (
    <Container
      sx={{
        width: '100%',
        height: '100%',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#f5f5f5',
      }}
    >
      <Container
        sx={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}
      >
        <Box
          sx={{ display: 'inline-block', alignItems: 'center', gap: '10px' }}
        >
          <Typography variant="h2" sx={{ fontWeight: 'bold' }}>
            Log Memo
          </Typography>
          <Link
            href="https://github.com/Dr-Dart/user-module-sample-log-memo"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              fontSize: '0.875rem',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            https://github.com/Dr-Dart/user-module-sample-log-memo
          </Link>
        </Box>
        <Box sx={{ display: 'flex' }}>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleClearClick}
            sx={{ width: '120px', margin: '10px' }}
          >
            {t('Clear')}
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleButtonClick}
            sx={{ width: '120px', margin: '10px' }}
          >
            {t('Export')}
          </Button>
        </Box>
      </Container>
      <Container
        sx={{
          display: 'flex',
          gap: '20px',
          flex: 1,
          height: '600px',
        }}
      >
        <Box
          sx={{
            width: '35%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: '8px', mb: 1 }}
          >
            <Typography variant="h6">DRL Sample</Typography>
            <Tooltip title={helpText} arrow>
              <HelpOutlineIcon
                sx={{
                  width: '18px',
                  height: '18px',
                  color: 'action.active',
                }}
              />
            </Tooltip>
          </Box>
          <Box
            sx={{
              padding: '15px',
              backgroundColor: 'white',
              borderRadius: '4px',
              border: '1px solid #ddd',
              flex: 1,
            }}
          >
            {sampleDrlCode}
          </Box>
        </Box>
        <Box
          sx={{
            width: '65%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Typography variant="h6" sx={{ mb: 1 }}>
            Logs
          </Typography>
          <Box
            sx={{
              borderRadius: '4px',
              padding: '15px',
              border: '1px solid #ddd',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <List
              component="div"
              ref={listRef}
              sx={{
                flex: 1,
                overflow: 'auto',
                '& .MuiListItem-root': {
                  display: 'block',
                },
              }}
            >
              {logs?.length > 0 ? (
                logs.map((log, index) => <LogItem key={index} log={log} />)
              ) : (
                <></>
              )}
            </List>
          </Box>
        </Box>
      </Container>
    </Container>
  );
}
