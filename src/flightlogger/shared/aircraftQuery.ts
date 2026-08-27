export const AIRCRAFT_QUERY = /* GraphQL */ `
  query Aircraft($after: String, $first: Int, $callSigns: [String!]) {
    aircraft(after: $after, first: $first, callSigns: $callSigns) {
      nodes {
        id
        callSign
        model
        aircraftClass
        aircraftType
        asymmetricTimeEnabled
        auprtTimeEnabled
        currentAirport {
          id
          name
        }
        defaultEngineType
        defaultPMF
        disabled
        floatTimeEnabled
        fuelCoefficient
        fuelCoefficientMeasurement
        fuelCoefficientUnit
        homeAirport {
          id
          name
        }
        instrumentTimeEnabled
        maintenanceParts(first: 50) {
          nodes {
            approvedAt
            expirationCycles
            expirationDate
            expirationLogSeconds
            expiresOnLog
            id
            maintenanceType {
              createdAt
              disabled
              expiresOnCycles
              expiresOnDate
              expiresOnLog
              name
              requireSerialNumber
              requireUploadOfDocument
              triggerOnLogTime
              updatedAt
            }
            name
            rejectedAt
            serialNumber
            status
          }
          pageInfo {
            endCursor
            hasNextPage
            hasPreviousPage
            startCursor
          }
        }
        nextService {
          cyclesWarningColor
          dateWarningColor
          nextPrimaryService
          nextSecondaryService
          nextServiceCycles
          nextServiceDate
          nextTertiaryService
          primaryWarningColor
          secondaryWarningColor
          tertiaryWarningColor
        }
        primaryLog {
          actionButtonsIsEnabled
          durationWarningPercent
          id
          measurementType
          offsetWarningSecondsEnd
          offsetWarningSecondsStart
          prefillIsEnabled
          totalSeconds
          type
        }
        secondaryLog {
          actionButtonsIsEnabled
          durationWarningPercent
          id
          measurementType
          offsetWarningSecondsEnd
          offsetWarningSecondsStart
          prefillIsEnabled
          totalSeconds
          type
        }
        tertiaryLog {
          actionButtonsIsEnabled
          durationWarningPercent
          id
          measurementType
          offsetWarningSecondsEnd
          offsetWarningSecondsStart
          prefillIsEnabled
          totalSeconds
          type
        }
        taxiInTime
        taxiOutTime
        timerSeconds
        totalAirborneMinutes
        totalFuel
        totalLandings
        typeOfTimer
        typeOfTimerMeasurement
        worstMaintenanceWarning {
          color
          cyclesLeft
          daysLeft
          expiryCycles
          expiryDate
          expiryTime
          hasDocument
          id
          logMeasurementType
          logType
          requirers
          serialNumber
          status
          subjectName
          timeLeft
          typeOfTimer
          typeOfTimerMeasurement
        }
        worstWarning {
          color
          cyclesLeft
          daysLeft
          expiryCycles
          expiryDate
          expiryTime
          hasDocument
          id
          logMeasurementType
          logType
          requirers
          serialNumber
          status
          subjectName
          timeLeft
          typeOfTimer
          typeOfTimerMeasurement
        }
      }
      pageInfo {
        endCursor
        hasNextPage
        hasPreviousPage
        startCursor
      }
    }
  }
`;

export const BASIC_AIRCRAFT_QUERY = /* GraphQL */ `
  query BasicAircraft($after: String, $first: Int, $callSigns: [String!]) {
    aircraft(after: $after, first: $first, callSigns: $callSigns) {
      nodes {
        id
        callSign
        model
        aircraftClass
        aircraftType
        disabled
        currentAirport {
          id
          name
        }
        homeAirport {
          id
          name
        }
      }
      pageInfo {
        endCursor
        hasNextPage
        hasPreviousPage
        startCursor
      }
    }
  }
`;
