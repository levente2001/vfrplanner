export const BOOKINGS_QUERY = /* GraphQL */ `
  query Bookings(
    $from: DateTime
    $to: DateTime
    $changedAfter: DateTime
    $all: Boolean
    $subtypes: [BookingSubtypeEnum!]
    $statuses: [BookingStatusEnum!]
    $overlap: Boolean
    $after: String
    $before: String
    $first: Int
    $last: Int
  ) {
    bookings(
      from: $from
      to: $to
      changedAfter: $changedAfter
      all: $all
      subtypes: $subtypes
      statuses: $statuses
      overlap: $overlap
      after: $after
      before: $before
      first: $first
      last: $last
    ) {
      edges {
        cursor
        node {
          __typename
          ... on ClassTheoryBooking {
            id
            startsAt
            endsAt
            status
            color
            comment
            subject
            emailNotifications
            class {
              ...ClassFields
            }
            classroom {
              ...ClassroomFields
            }
            instructor {
              ...UserFields
            }
            students {
              ...UserFields
            }
            theoryCourse {
              ...TheoryCourseFields
            }
          }
          ... on ExamBooking {
            id
            startsAt
            endsAt
            status
            color
            comment
            emailNotifications
            class {
              ...ClassFields
            }
            classroom {
              ...ClassroomFields
            }
            instructor {
              ...UserFields
            }
            students {
              ...UserFields
            }
            theoryCourse {
              ...TheoryCourseFields
            }
          }
          ... on ExtraTheoryBooking {
            id
            startsAt
            endsAt
            status
            color
            comment
            emailNotifications
            classroom {
              ...ClassroomFields
            }
            instructor {
              ...UserFields
            }
            student {
              ...UserFields
            }
          }
          ... on MaintenanceBooking {
            id
            startsAt
            endsAt
            flightStartsAt
            flightEndsAt
            status
            color
            comment
            emailNotifications
            aircraft {
              ...AircraftFields
            }
            arrivalAirport {
              ...AirportFields
            }
            departureAirport {
              ...AirportFields
            }
          }
          ... on MeetingBooking {
            id
            startsAt
            endsAt
            status
            color
            comment
            emailNotifications
            classroom {
              ...ClassroomFields
            }
            participants {
              ...UserFields
            }
          }
          ... on MultiStudentBooking {
            id
            startsAt
            endsAt
            flightStartsAt
            flightEndsAt
            status
            color
            comment
            emailNotifications
            aircraft {
              ...AircraftFields
            }
            arrivalAirport {
              ...AirportFields
            }
            departureAirport {
              ...AirportFields
            }
            instructor {
              ...UserFields
            }
            students {
              ...UserFields
            }
            plannedLessons {
              ...TrainingFields
            }
            registrations {
              ...TrainingFields
            }
            cancellations {
              ...CancellationFields
            }
          }
          ... on OperationBooking {
            id
            startsAt
            endsAt
            flightStartsAt
            flightEndsAt
            status
            color
            comment
            emailNotifications
            aircraft {
              ...AircraftFields
            }
            arrivalAirport {
              ...AirportFields
            }
            departureAirport {
              ...AirportFields
            }
            crew {
              ...UserFields
            }
            customer {
              id
              name
              fullName
              company
              email
              phone
            }
            operationType {
              id
              name
              note
              externalReference
            }
            pic {
              ...UserFields
            }
            registration {
              id
              comment
              totalSeconds
              operationType {
                id
                name
              }
              pic {
                ...UserFields
              }
              customer {
                id
                name
                fullName
              }
            }
            cancellation {
              ...CancellationFields
            }
          }
          ... on ProgressTestBooking {
            id
            startsAt
            endsAt
            status
            color
            comment
            subject
            emailNotifications
            class {
              ...ClassFields
            }
            classroom {
              ...ClassroomFields
            }
            instructor {
              ...UserFields
            }
            students {
              ...UserFields
            }
            theoryCourse {
              ...TheoryCourseFields
            }
          }
          ... on RentalBooking {
            id
            startsAt
            endsAt
            flightStartsAt
            flightEndsAt
            status
            color
            comment
            emailNotifications
            approved
            aircraft {
              ...AircraftFields
            }
            arrivalAirport {
              ...AirportFields
            }
            departureAirport {
              ...AirportFields
            }
            renter {
              ...UserFields
            }
            registration {
              id
              comment
              totalSeconds
              renter {
                ...UserFields
              }
            }
            cancellation {
              ...CancellationFields
            }
          }
          ... on SingleStudentBooking {
            id
            startsAt
            endsAt
            flightStartsAt
            flightEndsAt
            status
            color
            comment
            emailNotifications
            aircraft {
              ...AircraftFields
            }
            arrivalAirport {
              ...AirportFields
            }
            departureAirport {
              ...AirportFields
            }
            instructor {
              ...UserFields
            }
            student {
              ...UserFields
            }
            plannedLesson {
              ...TrainingFields
            }
            registration {
              ...TrainingFields
            }
            cancellation {
              ...CancellationFields
            }
          }
          ... on TheoryReleaseBooking {
            id
            startsAt
            endsAt
            status
            color
            comment
            subject
            emailNotifications
            class {
              ...ClassFields
            }
            classroom {
              ...ClassroomFields
            }
            instructor {
              ...UserFields
            }
            students {
              ...UserFields
            }
            theoryCourse {
              ...TheoryCourseFields
            }
          }
          ... on TypeQuestionnaireBooking {
            id
            startsAt
            endsAt
            status
            color
            comment
            emailNotifications
            class {
              ...ClassFields
            }
            classroom {
              ...ClassroomFields
            }
            instructor {
              ...UserFields
            }
            students {
              ...UserFields
            }
            theoryCourse {
              ...TheoryCourseFields
            }
          }
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

  fragment AircraftFields on Aircraft {
    id
    callSign
    model
    aircraftClass
    aircraftType
  }

  fragment AirportFields on Airport {
    id
    name
  }

  fragment CancellationFields on BookingCancellation {
    id
    title
    comment
    user {
      ...UserFields
    }
  }

  fragment ClassFields on Class {
    id
    name
  }

  fragment ClassroomFields on Classroom {
    id
    name
  }

  fragment TheoryCourseFields on TheoryCourse {
    id
    name
    disabled
  }

  fragment TrainingFields on Training {
    id
    name
    status
    comment
    student {
      ...UserFields
    }
    instructor {
      ...UserFields
    }
  }

  fragment UserFields on User {
    id
    firstName
    lastName
    callSign
    avatarUrl
  }
`;
